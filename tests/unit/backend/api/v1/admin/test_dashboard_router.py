"""管理员 Dashboard API 测试。"""

from collections.abc import Iterator
from datetime import UTC, datetime
from importlib import import_module
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from app.api.deps import get_current_admin
from app.core.config import settings
from app.main import app
from app.models.admin_dashboard import (
    AdminDashboard,
    DashboardRange,
    QueueMetrics,
    RenderMetrics,
    StorageBucket,
    StorageMetrics,
    UserMetrics,
)
from app.models.user import User
from app.service.queue_service import render_queue

dashboard_module = import_module("app.api.v1.admin.dashboard_router")


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    monkeypatch.setattr(settings, "render_queue_autostart", False)
    render_queue.reset()
    app.dependency_overrides[get_current_admin] = lambda: User(id=1, email="admin@example.com", is_admin=True, created_at=datetime.now(tz=UTC))
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def test_dashboard_passes_requested_range(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    empty = StorageBucket(count=0, bytes=0)
    result = AdminDashboard(range=DashboardRange.DAYS_30, users=UserMetrics(total=0, admins=0, verified=0, active=0), renders=RenderMetrics(submitted=0, queued=0, running=0, done=0, failed=0, canceled=0, success_rate=0, avg_queue_ms=0, p95_queue_ms=0, avg_render_ms=0, p95_render_ms=0), queue=QueueMetrics(pending=0, running=0, concurrency=2), storage=StorageMetrics(uploads=empty, outputs=empty, public_assets=empty), recent_failures=[], top_errors=[])
    service = MagicMock()
    service.get = AsyncMock(return_value=result)
    monkeypatch.setattr(dashboard_module, "DashboardService", lambda _session, _queue: service)
    response = client.get("/api/v1/admin/dashboard?range=30d")
    assert response.status_code == 200
    assert response.json()["range"] == "30d"
    service.get.assert_awaited_once_with(DashboardRange.DAYS_30)
