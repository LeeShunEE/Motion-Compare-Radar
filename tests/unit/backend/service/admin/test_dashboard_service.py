"""管理员 Dashboard 聚合测试。"""

from datetime import UTC, datetime, timedelta
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.core.config import settings
from app.models.admin_dashboard import DashboardRange
from app.models.admin_render import QueueTaskSnapshot, RenderQueueSnapshot
from app.models.render_task import Codec, RenderMode, RenderStatus, RenderTask
from app.models.user import User
from app.service.admin.dashboard_service import DashboardService, _normalize_error


def _task(task_id: int, status: RenderStatus, *, duration_ms: int | None = None, error: str | None = None) -> RenderTask:
    created = datetime.now(tz=UTC) - timedelta(minutes=5)
    return RenderTask(id=task_id, user_id=2, mode=RenderMode.SINGLE, codec=Codec.H264, status=status, input_props={}, output_path=f"/tmp/{task_id}.mp4", error=error, duration_ms=duration_ms, created_at=created, started_at=created + timedelta(seconds=2), finished_at=created + timedelta(seconds=5) if status in {RenderStatus.DONE, RenderStatus.FAILED} else None)


async def test_dashboard_aggregates_metrics_and_storage(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    users_root = tmp_path / "storage" / "users" / "2"
    (users_root / "uploads").mkdir(parents=True)
    (users_root / "outputs").mkdir()
    (users_root / "uploads" / "shape.svg").write_bytes(b"123")
    (users_root / "outputs" / "movie.mp4").write_bytes(b"12345")
    public = tmp_path / "public"
    (public / "silhouettes").mkdir(parents=True)
    (public / "music").mkdir()
    (public / "music" / "intro.mp3").write_bytes(b"12")
    monkeypatch.setattr(settings, "storage_root", tmp_path / "storage")
    monkeypatch.setattr(settings, "public_assets_path", public)

    service = DashboardService.__new__(DashboardService)
    service._users = AsyncMock()
    service._users.list_all.return_value = [User(id=1, email="a@example.com", is_admin=True, is_verified=True, created_at=datetime.now(tz=UTC)), User(id=2, email="b@example.com", created_at=datetime.now(tz=UTC))]
    service._audits = AsyncMock()
    service._audits.active_user_ids_since.return_value = {1, 2}
    done = _task(1, RenderStatus.DONE, duration_ms=3000)
    failed = _task(2, RenderStatus.FAILED, duration_ms=5000, error="worker timeout after 5s")
    service._tasks = AsyncMock()
    service._tasks.list_created_since.return_value = [done, failed]
    service._tasks.list_recent_failed.return_value = [failed]
    service._queue = MagicMock()
    service._queue.admin_snapshot.return_value = RenderQueueSnapshot(concurrency=2, queue_size=1, avg_fps=24, tasks=[QueueTaskSnapshot(task_id=3, status=RenderStatus.QUEUED, position=1)])

    dashboard = await service.get(DashboardRange.DAYS_7)

    assert dashboard.users.active == 2
    assert dashboard.renders.success_rate == 0.5
    assert dashboard.renders.avg_queue_ms == 2000
    assert dashboard.renders.p95_render_ms == 5000
    assert dashboard.queue.pending == 1
    assert dashboard.storage.uploads.bytes == 3
    assert dashboard.storage.outputs.bytes == 5
    assert dashboard.storage.public_assets.count == 1
    assert dashboard.top_errors[0].error_code == "worker_timeout"


def test_error_normalization_does_not_expose_raw_messages() -> None:
    assert _normalize_error("connect ECONNREFUSED 10.0.0.1") == "worker_unreachable"
    assert _normalize_error("out of memory: secret detail") == "out_of_memory"
    assert _normalize_error(None) == "render_failed"


async def test_dashboard_empty_data_returns_zero_metrics(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "storage_root", tmp_path / "storage")
    monkeypatch.setattr(settings, "public_assets_path", tmp_path / "public")
    service = DashboardService.__new__(DashboardService)
    service._users = AsyncMock()
    service._users.list_all.return_value = []
    service._audits = AsyncMock()
    service._audits.active_user_ids_since.return_value = set()
    service._tasks = AsyncMock()
    service._tasks.list_created_since.return_value = []
    service._tasks.list_recent_failed.return_value = []
    service._queue = MagicMock()
    service._queue.admin_snapshot.return_value = RenderQueueSnapshot(
        concurrency=2,
        queue_size=0,
        avg_fps=None,
        tasks=[],
    )

    dashboard = await service.get(DashboardRange.HOURS_24)

    assert dashboard.users.total == 0
    assert dashboard.renders.submitted == 0
    assert dashboard.renders.success_rate == 0
    assert dashboard.storage.uploads.count == 0
    assert dashboard.top_errors == []
