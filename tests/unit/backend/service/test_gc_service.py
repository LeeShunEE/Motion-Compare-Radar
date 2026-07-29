"""service/gc_service.py 单元测试。

GC 服务逻辑（启动/停止/清理策略）不依赖真实文件系统，
直接构造 OutputGCService 实例验证。
"""

import asyncio
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.core.config import Settings
from app.service.file_service import FileService
from app.service.gc_service import OutputGCService


def _make_config(
    gc_enabled: bool = True,
    gc_interval: int = 3600,
    gc_max_age_days: int = 7,
    gc_global_max_size_bytes: int = 10 * 1024 * 1024 * 1024,  # 10GB
) -> Settings:
    """创建测试配置。"""
    return Settings(
        output_gc_enabled=gc_enabled,
        output_gc_interval_seconds=gc_interval,
        output_gc_max_age_days=gc_max_age_days,
        output_gc_global_max_size_bytes=gc_global_max_size_bytes,
    )


def _make_file_service() -> FileService:
    """创建测试文件服务。"""
    return FileService(Path("/tmp/test_storage"), 200 * 1024 * 1024, 500)


def _make_session_factory(mock_session: AsyncMock) -> AsyncMock:
    """创建返回 mock_session 的 session_factory。"""
    @asynccontextmanager
    async def _factory():
        yield mock_session
    return _factory


def _make_gc_service(
    session_factory: AsyncMock | None = None,
    file_service: FileService | None = None,
    config: Settings | None = None,
) -> OutputGCService:
    """创建测试 GC 服务实例。"""
    if session_factory is None:
        mock_session = AsyncMock()
        session_factory = _make_session_factory(mock_session)
    if file_service is None:
        file_service = _make_file_service()
    if config is None:
        config = _make_config()
    return OutputGCService(
        session_factory=session_factory,
        file_service=file_service,
        config=config,
    )


class TestStartStop:
    """启动/停止测试。"""

    async def test_start_creates_task(self) -> None:
        """start 创建后台任务。"""
        gc = _make_gc_service()
        await gc.start()
        assert gc._gc_task is not None
        await gc.stop()

    async def test_start_idempotent(self) -> None:
        """多次 start 只创建一个任务。"""
        gc = _make_gc_service()
        await gc.start()
        task = gc._gc_task
        await gc.start()
        assert gc._gc_task is task
        await gc.stop()

    async def test_stop_cancels_task(self) -> None:
        """stop 取消后台任务。"""
        gc = _make_gc_service()
        await gc.start()
        await gc.stop()
        assert gc._gc_task is None

    async def test_stop_idempotent(self) -> None:
        """多次 stop 不报错。"""
        gc = _make_gc_service()
        await gc.stop()
        await gc.stop()


class TestCleanupExpiredByTime:
    """时间维度清理测试。"""

    async def test_cleanup_expired_files(self) -> None:
        """清理过期文件（时间维度）。"""
        gc = _make_gc_service(config=_make_config(gc_max_age_days=7))

        # Mock UserDAO.list_all_ids 返回用户列表
        mock_user_dao = MagicMock()
        mock_user_dao.list_all_ids = AsyncMock(return_value=[1])

        # Mock RenderTaskDAO.list_expired_for_user 返回过期任务
        now = datetime.now(tz=UTC)
        cutoff = now - timedelta(days=8)  # 超过 7 天
        expired_task = MagicMock()
        expired_task.id = 1
        expired_task.output_path = "/tmp/test_storage/users/1/outputs/video1.mp4"
        expired_task.finished_at = cutoff

        mock_task_dao = MagicMock()
        mock_task_dao.list_expired_for_user = AsyncMock(return_value=[expired_task])

        # Mock 文件存在
        output_path = MagicMock(spec=Path)
        output_path.is_file.return_value = True
        output_path.unlink = MagicMock()

        with patch("app.service.gc_service.UserDAO", return_value=mock_user_dao):
            with patch("app.service.gc_service.RenderTaskDAO", return_value=mock_task_dao):
                with patch("app.service.gc_service.Path", return_value=output_path):
                    deleted = await gc._cleanup_expired_by_time()

        assert 1 in deleted
        output_path.unlink.assert_called()

    async def test_skip_missing_files(self) -> None:
        """跳过不存在的文件。"""
        gc = _make_gc_service(config=_make_config(gc_max_age_days=7))

        mock_user_dao = MagicMock()
        mock_user_dao.list_all_ids = AsyncMock(return_value=[1])

        mock_task_dao = MagicMock()
        mock_task_dao.list_expired_for_user = AsyncMock(return_value=[
            MagicMock(
                id=1,
                output_path="/tmp/test_storage/users/1/outputs/video1.mp4",
                finished_at=datetime.now(tz=UTC) - timedelta(days=8),
            )
        ])

        # Mock 文件不存在
        output_path = MagicMock(spec=Path)
        output_path.is_file.return_value = False
        output_path.unlink = MagicMock()

        with patch("app.service.gc_service.UserDAO", return_value=mock_user_dao):
            with patch("app.service.gc_service.RenderTaskDAO", return_value=mock_task_dao):
                with patch("app.service.gc_service.Path", return_value=output_path):
                    deleted = await gc._cleanup_expired_by_time()

        assert deleted == []
        output_path.unlink.assert_not_called()


class TestCleanupAuditEvents:
    """审计事件按独立留存周期清理。"""

    async def test_deletes_events_older_than_retention(self) -> None:
        gc = _make_gc_service(
            config=Settings(
                output_gc_enabled=True,
                audit_retention_days=180,
            )
        )
        audit_dao = MagicMock()
        audit_dao.delete_before = AsyncMock(return_value=4)

        with patch("app.service.gc_service.AuditEventDAO", return_value=audit_dao):
            deleted = await gc._cleanup_expired_audit_events()

        assert deleted == 4
        cutoff = audit_dao.delete_before.await_args.args[0]
        expected = datetime.now(tz=UTC) - timedelta(days=180)
        assert abs((cutoff - expected).total_seconds()) < 2


class TestCleanupByGlobalQuota:
    """全局配额维度清理测试。"""

    async def test_no_cleanup_when_quota_ok(self) -> None:
        """配额达标时不删除文件。"""
        gc = _make_gc_service(
            config=_make_config(gc_global_max_size_bytes=500)  # 500 bytes 配额
        )

        # Mock directory_size 返回正常大小
        with patch("app.service.gc_service.directory_size", return_value=100):
            deleted = await gc._cleanup_by_global_quota()

        assert deleted == []

    async def test_deletes_oldest_when_quota_exceeded(self) -> None:
        """超配额时删除最老文件。"""
        gc = _make_gc_service(
            config=_make_config(gc_global_max_size_bytes=100)  # 100 bytes 配额
        )

        # Mock UserDAO.list_all_ids
        mock_user_dao = MagicMock()
        mock_user_dao.list_all_ids = AsyncMock(return_value=[1])

        # Mock RenderTaskDAO.list_done_for_user 返回两个任务（按 finished_at 升序）
        task1 = MagicMock()
        task1.id = 1
        task1.output_path = "/outputs/video1.mp4"
        task1.finished_at = datetime(2026, 1, 1, tzinfo=UTC)

        task2 = MagicMock()
        task2.id = 2
        task2.output_path = "/outputs/video2.mp4"
        task2.finished_at = datetime(2026, 1, 2, tzinfo=UTC)

        mock_task_dao = MagicMock()
        mock_task_dao.list_done_for_user = AsyncMock(return_value=[task1, task2])

        # Mock users_dir 存在
        users_dir = MagicMock(spec=Path)
        users_dir.exists.return_value = True
        users_dir.iterdir.return_value = [
            MagicMock(is_dir=lambda: True, __truediv__=lambda self, x: MagicMock(exists=lambda: True))
        ]

        # Mock file_service._storage_root
        gc._file_service._storage_root = MagicMock(spec=Path)
        gc._file_service._storage_root.__truediv__ = lambda self, x: users_dir

        # Mock directory_size 返回超配额大小
        with patch("app.service.gc_service.directory_size", return_value=200):
            # Mock Path
            output_path1 = MagicMock(spec=Path)
            output_path1.is_file.return_value = True
            output_path1.stat.return_value.st_size = 150
            output_path1.unlink = MagicMock()

            with patch("app.service.gc_service.UserDAO", return_value=mock_user_dao):
                with patch("app.service.gc_service.RenderTaskDAO", return_value=mock_task_dao):
                    with patch("app.service.gc_service.Path") as mock_path:
                        def mock_path_func(arg):
                            if "video1" in str(arg):
                                return output_path1
                            return MagicMock(spec=Path)
                        mock_path.side_effect = mock_path_func
                        deleted = await gc._cleanup_by_global_quota()

        # 应删除最老的文件（task1）以使配额达标
        assert 1 in deleted
        output_path1.unlink.assert_called()

    async def test_no_cleanup_when_users_dir_missing(self) -> None:
        """用户目录不存在时不清理。"""
        gc = _make_gc_service()

        # Mock users_dir 不存在
        users_dir = MagicMock(spec=Path)
        users_dir.exists.return_value = False

        gc._file_service._storage_root = MagicMock(spec=Path)
        gc._file_service._storage_root.__truediv__ = lambda self, x: users_dir

        deleted = await gc._cleanup_by_global_quota()
        assert deleted == []
