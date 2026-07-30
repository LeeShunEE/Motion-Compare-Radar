"""渲染产物自动清理服务。

清理策略（双维度）：
1. 时间维度：删除 finished_at + gc_max_age_days < now 的产物（按用户遍历）
2. 配额维度：若全局 outputs 目录大小超过 gc_global_max_size_bytes，按 finished_at 删除最老文件

全局 outputs 目录 = 所有用户的 storage_root/users/<uid>/outputs/ 总和。

优雅停止：cancel + await（遵循 queue_service 模式）
"""

import asyncio
import logging
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.dao.audit_event_dao import AuditEventDAO
from app.dao.render_task_dao import RenderTaskDAO
from app.dao.user_dao import UserDAO
from app.service.file_service import FileService
from app.utils.sizing import directory_size

logger = logging.getLogger(__name__)

SessionFactory = Callable[[], AsyncSession]


class OutputGCService:
    """渲染产物自动清理服务。"""

    def __init__(
        self,
        session_factory: SessionFactory,
        file_service: FileService,
        config: Settings,
    ) -> None:
        self._session_factory = session_factory
        self._file_service = file_service
        self._config = config
        self._gc_task: asyncio.Task[None] | None = None

    async def start(self) -> None:
        """启动周期性 GC 后台任务。"""
        if self._gc_task is not None:
            return
        self._gc_task = asyncio.create_task(self._gc_loop())
        logger.info(
            f"GC 服务已启动：周期 {self._config.output_gc_interval_seconds}s，"
            f"保留 {self._config.output_gc_max_age_days} 天，"
            f"全局配额 {self._config.output_gc_global_max_size_bytes // 1024 // 1024 // 1024}GB"
        )

    async def stop(self) -> None:
        """优雅停止 GC 任务。"""
        if self._gc_task is None:
            return
        self._gc_task.cancel()
        try:
            await self._gc_task
        except asyncio.CancelledError:
            pass
        self._gc_task = None
        logger.info("GC 服务已停止")

    async def _gc_loop(self) -> None:
        """主循环：await asyncio.sleep(interval) + run_gc_cycle()"""
        while True:
            await asyncio.sleep(self._config.output_gc_interval_seconds)
            try:
                await self.run_gc_cycle()
            except Exception:  # noqa: BLE001 后台循环不能因单次异常退出
                logger.exception("GC 周期执行异常")

    async def run_gc_cycle(self) -> None:
        """执行清理周期：时间维度 → 配额维度。"""
        # 1. 时间维度：遍历所有用户，删除过期文件
        time_deleted = await self._cleanup_expired_by_time()

        # 2. 配额维度：检查全局 outputs 大小，超配额时删除最老文件
        quota_deleted = await self._cleanup_by_global_quota()

        # 3. 审计事件使用独立的长期留存窗口。
        audit_deleted = await self._cleanup_expired_audit_events()

        total_deleted = len(time_deleted) + len(quota_deleted)
        logger.info(
            f"GC 周期完成：时间维度删除 {len(time_deleted)} 个，"
            f"配额维度删除 {len(quota_deleted)} 个，"
            f"共 {total_deleted} 个产物文件"
            f"，审计事件删除 {audit_deleted} 条"
        )

    async def _cleanup_expired_audit_events(self) -> int:
        """删除超过审计留存窗口的事件。"""
        cutoff = datetime.now(tz=UTC) - timedelta(
            days=self._config.audit_retention_days
        )
        async with self._session_factory() as session:
            return await AuditEventDAO(session).delete_before(cutoff)

    async def _cleanup_expired_by_time(self) -> list[int]:
        """时间维度清理：删除所有用户的过期产物。

        过期判定：finished_at + max_age_days < now（UTC）。
        """
        deleted_ids: list[int] = []

        async with self._session_factory() as session:
            user_dao = UserDAO(session)
            user_ids = await user_dao.list_all_ids()

        logger.debug(f"GC 时间维度：共 {len(user_ids)} 用户")

        for user_id in user_ids:
            deleted = await self._cleanup_user_expired(user_id)
            deleted_ids.extend(deleted)

        return deleted_ids

    async def _cleanup_user_expired(self, user_id: int) -> list[int]:
        """清理单个用户的过期产物，返回删除的任务 ID 列表。"""
        deleted_ids: list[int] = []

        async with self._session_factory() as session:
            dao = RenderTaskDAO(session)
            expired = await dao.list_expired_for_user(
                user_id, self._config.output_gc_max_age_days
            )
            for task in expired:
                output_path = Path(task.output_path)
                if output_path.is_file():
                    output_path.unlink()
                    logger.debug(f"GC 删除过期产物：task_id={task.id}")
                    deleted_ids.append(task.id)

        return deleted_ids

    def _calculate_global_outputs_size(self) -> int:
        """计算全局 outputs 目录总大小。"""
        storage_root = self._file_service._storage_root
        users_dir = storage_root / "users"

        if not users_dir.exists():
            return 0

        global_size = 0
        for user_dir in users_dir.iterdir():
            if user_dir.is_dir():
                outputs_dir = user_dir / "outputs"
                if outputs_dir.exists():
                    global_size += directory_size(outputs_dir)

        return global_size

    async def _collect_all_done_tasks(self) -> list[tuple[int, int, str, datetime]]:
        """收集所有用户的 done 任务，返回按 finished_at 升序排序的列表。

        返回格式：(user_id, task_id, output_path, finished_at)
        """
        all_tasks: list[tuple[int, int, str, datetime]] = []

        async with self._session_factory() as session:
            user_dao = UserDAO(session)
            user_ids = await user_dao.list_all_ids()

            task_dao = RenderTaskDAO(session)
            for user_id in user_ids:
                done_tasks = await task_dao.list_done_for_user(user_id)
                for t in done_tasks:
                    if t.finished_at is not None:
                        # 确保 datetime 是 UTC aware（SQLite 存储可能丢失 tzinfo）
                        finished_at = t.finished_at
                        if finished_at.tzinfo is None:
                            finished_at = finished_at.replace(tzinfo=UTC)
                        all_tasks.append((user_id, t.id, t.output_path, finished_at))

        # 按 finished_at 升序（最老在前）
        all_tasks.sort(key=lambda x: x[3])
        return all_tasks

    def _delete_until_quota_ok(
        self,
        tasks: list[tuple[int, int, str, datetime]],
        current_size: int,
        max_size: int,
    ) -> tuple[list[int], int]:
        """删除文件直到配额达标，返回（删除的任务 ID 列表, 最终大小）。"""
        deleted_ids: list[int] = []

        for user_id, task_id, output_path_str, _ in tasks:
            output_path = Path(output_path_str)
            if not output_path.is_file():
                continue
            file_size = output_path.stat().st_size
            output_path.unlink()
            current_size -= file_size
            deleted_ids.append(task_id)
            logger.debug(f"GC 删除超配额产物：task_id={task_id}")
            if current_size <= max_size:
                break

        return deleted_ids, current_size

    async def _cleanup_by_global_quota(self) -> list[int]:
        """配额维度清理：若全局 outputs 超配额，删除最老文件直到达标。

        全局 outputs = 所有用户 outputs 目录的总大小。
        """
        global_size = self._calculate_global_outputs_size()
        max_size = self._config.output_gc_global_max_size_bytes

        logger.debug(
            f"GC 配额维度：全局 outputs {global_size // 1024 // 1024}MB "
            f"/ {max_size // 1024 // 1024 // 1024}GB"
        )

        if global_size <= max_size:
            return []

        # 收集所有 done 任务并排序
        all_done_tasks = await self._collect_all_done_tasks()

        # 删除最老文件直到配额达标
        deleted_ids, final_size = self._delete_until_quota_ok(
            all_done_tasks, global_size, max_size
        )

        logger.debug(f"GC 配额维度清理完成：最终大小 {final_size // 1024 // 1024}MB")
        return deleted_ids


# 单例初始化（在 lifespan 中启动）
from app.core.config import settings
from app.core.database import async_session_factory

output_gc = OutputGCService(
    session_factory=async_session_factory,
    file_service=FileService(
        settings.storage_root,
        settings.max_user_storage_bytes,
        settings.max_user_upload_count,
    ),
    config=settings,
)
