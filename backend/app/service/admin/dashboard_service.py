"""管理员运营指标聚合服务。"""

import math
from collections import Counter
from datetime import UTC, datetime, timedelta
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.dao.audit_event_dao import AuditEventDAO
from app.dao.render_task_dao import RenderTaskDAO
from app.dao.user_dao import UserDAO
from app.models.admin_dashboard import (
    AdminDashboard,
    DashboardRange,
    ErrorAggregate,
    QueueMetrics,
    RenderFailure,
    RenderMetrics,
    StorageBucket,
    StorageMetrics,
    UserMetrics,
)
from app.models.render_task import RenderStatus, RenderTask
from app.service.queue_service import RenderQueue
from app.utils.datetime import ensure_utc


def _percentile_95(values: list[int]) -> int:
    if not values:
        return 0
    ordered = sorted(values)
    return ordered[max(math.ceil(len(ordered) * 0.95) - 1, 0)]


def _average(values: list[int]) -> int:
    return round(sum(values) / len(values)) if values else 0


def _normalize_error(error: str | None) -> str:
    value = (error or "").casefold()
    if "timeout" in value or "超时" in value:
        return "worker_timeout"
    if "unreachable" in value or "不可达" in value or "connect" in value:
        return "worker_unreachable"
    if "memory" in value or "内存" in value:
        return "out_of_memory"
    if "invalid" in value or "无效" in value:
        return "invalid_input"
    return "render_failed"


def _scan_roots(roots: list[Path]) -> StorageBucket:
    count = 0
    total = 0
    partial = False
    for root in roots:
        try:
            if not root.exists():
                continue
            for path in root.rglob("*"):
                if path.is_file():
                    count += 1
                    total += path.stat().st_size
        except OSError:
            partial = True
    return StorageBucket(count=count, bytes=total, partial=partial)


class DashboardService:
    """组合数据库、队列和文件系统的当前运营快照。"""

    def __init__(self, session: AsyncSession, queue: RenderQueue) -> None:
        self._users = UserDAO(session)
        self._audits = AuditEventDAO(session)
        self._tasks = RenderTaskDAO(session)
        self._queue = queue

    async def get(self, dashboard_range: DashboardRange) -> AdminDashboard:
        cutoff = datetime.now(tz=UTC) - timedelta(days=dashboard_range.days)
        users = await self._users.list_all()
        active_user_ids = await self._audits.active_user_ids_since(cutoff)
        tasks = await self._tasks.list_created_since(cutoff)
        failures = await self._tasks.list_recent_failed(10)
        queue = self._queue.admin_snapshot()

        status_counts = Counter(task.status for task in tasks)
        terminal = (
            status_counts[RenderStatus.DONE]
            + status_counts[RenderStatus.FAILED]
            + status_counts[RenderStatus.CANCELED]
        )
        queue_times = [
            max(
                round(
                    (ensure_utc(task.started_at) - ensure_utc(task.created_at)).total_seconds()
                    * 1000
                ),
                0,
            )
            for task in tasks
            if task.started_at is not None
        ]
        render_times = [task.duration_ms for task in tasks if task.duration_ms is not None]
        running = sum(item.status is RenderStatus.RUNNING for item in queue.tasks)
        pending = sum(item.status is RenderStatus.QUEUED for item in queue.tasks)
        error_counts = Counter(_normalize_error(task.error) for task in failures)

        return AdminDashboard(
            range=dashboard_range,
            users=UserMetrics(
                total=len(users),
                admins=sum(user.is_admin for user in users),
                verified=sum(user.is_verified for user in users),
                active=len(active_user_ids),
            ),
            renders=RenderMetrics(
                submitted=len(tasks),
                queued=status_counts[RenderStatus.QUEUED],
                running=status_counts[RenderStatus.RUNNING],
                done=status_counts[RenderStatus.DONE],
                failed=status_counts[RenderStatus.FAILED],
                canceled=status_counts[RenderStatus.CANCELED],
                success_rate=status_counts[RenderStatus.DONE] / terminal if terminal else 0,
                avg_queue_ms=_average(queue_times),
                p95_queue_ms=_percentile_95(queue_times),
                avg_render_ms=_average(render_times),
                p95_render_ms=_percentile_95(render_times),
            ),
            queue=QueueMetrics(
                pending=pending,
                running=running,
                concurrency=queue.concurrency,
                avg_fps=queue.avg_fps,
            ),
            storage=self._storage_metrics(users_root=settings.storage_root / "users"),
            recent_failures=[self._failure(task) for task in failures],
            top_errors=[
                ErrorAggregate(error_code=code, count=count)
                for code, count in error_counts.most_common(5)
            ],
        )

    @staticmethod
    def _failure(task: RenderTask) -> RenderFailure:
        return RenderFailure(
            task_id=task.id,
            user_id=task.user_id,
            error_code=_normalize_error(task.error),
            created_at=task.created_at,
        )

    @staticmethod
    def _storage_metrics(*, users_root: Path) -> StorageMetrics:
        user_dirs = []
        try:
            if users_root.exists():
                user_dirs = [path for path in users_root.iterdir() if path.is_dir()]
        except OSError:
            partial = StorageBucket(count=0, bytes=0, partial=True)
            return StorageMetrics(uploads=partial, outputs=partial, public_assets=_scan_roots([settings.public_assets_path]))
        return StorageMetrics(
            uploads=_scan_roots([path / "uploads" for path in user_dirs]),
            outputs=_scan_roots([path / "outputs" for path in user_dirs]),
            public_assets=_scan_roots(
                [
                    settings.public_assets_path / "silhouettes",
                    settings.public_assets_path / "music",
                ]
            ),
        )
