"""管理员渲染运维 API 契约测试。"""

from collections.abc import Iterator
from datetime import UTC, datetime
from importlib import import_module
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from app.api.deps import get_current_admin
from app.core.config import settings
from app.main import app
from app.models.admin_render import (
    ActiveRenderSnapshot,
    ActiveRenderTask,
    QueueTaskSnapshot,
    RenderQueueSnapshot,
)
from app.models.render_task import Codec, RenderMode, RenderStatus, RenderTask
from app.models.user import User
from app.service.queue_service import render_queue

render_router_module = import_module("app.api.v1.admin.render_router")


def _task(task_id: int, status: RenderStatus) -> RenderTask:
    return RenderTask(id=task_id, user_id=3, mode=RenderMode.SINGLE, codec=Codec.H264, status=status, input_props={}, output_path=f"/tmp/{task_id}.mp4", created_at=datetime(2026, 1, 1, tzinfo=UTC))


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    admin = User(id=1, email="admin@example.com", is_admin=True, created_at=datetime(2026, 1, 1, tzinfo=UTC))
    monkeypatch.setattr(settings, "render_queue_autostart", False)
    render_queue.reset()
    app.dependency_overrides[get_current_admin] = lambda: admin
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def test_active_returns_queue_progress(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    queue_item = QueueTaskSnapshot(task_id=8, status=RenderStatus.RUNNING, position=0, rendered_frames=20, total_frames=100, eta_seconds=4)
    snapshot = ActiveRenderSnapshot(queue=RenderQueueSnapshot(concurrency=2, queue_size=1, avg_fps=30, tasks=[queue_item]), tasks=[ActiveRenderTask(task=_task(8, RenderStatus.RUNNING), queue=queue_item)])
    service = MagicMock()
    service.active = AsyncMock(return_value=snapshot)
    monkeypatch.setattr(render_router_module, "RenderAdminService", lambda _session, _queue: service)
    response = client.get("/api/v1/admin/render/active")
    assert response.status_code == 200
    assert response.json()["items"][0]["rendered_frames"] == 20
    assert response.json()["concurrency"] == 2


def test_retry_uses_admin_actor(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    retried = _task(12, RenderStatus.QUEUED).model_copy(update={"retry_of_task_id": 8})
    service = MagicMock()
    service.retry = AsyncMock(return_value=retried)
    monkeypatch.setattr(render_router_module, "RenderAdminService", lambda _session, _queue: service)
    response = client.post("/api/v1/admin/render/8/retry")
    assert response.status_code == 200
    assert response.json()["retry_of_task_id"] == 8
    service.retry.assert_awaited_once_with(actor_user_id=1, task_id=8)
