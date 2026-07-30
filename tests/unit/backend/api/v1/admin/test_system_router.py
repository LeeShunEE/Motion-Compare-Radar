"""管理员系统健康 API 测试。"""

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
    ComponentHealth,
    HealthState,
    StorageHealth,
    SystemHealth,
)
from app.models.user import User
from app.service.queue_service import render_queue

system_module = import_module("app.api.v1.admin.system_router")


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    monkeypatch.setattr(settings, "render_queue_autostart", False)
    render_queue.reset()
    app.dependency_overrides[get_current_admin] = lambda: User(id=1, email="admin@example.com", is_admin=True, created_at=datetime.now(tz=UTC))
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def test_system_health_returns_degraded_children(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    ok_storage = StorageHealth(state=HealthState.HEALTHY, readable=True, writable=True)
    health = SystemHealth(state=HealthState.DEGRADED, uptime_seconds=42, database=ComponentHealth(state=HealthState.HEALTHY), render_worker=ComponentHealth(state=HealthState.DEGRADED, message="render worker unavailable"), backend_storage=ok_storage, public_assets=ok_storage, render_tmp=ok_storage, disk_total_bytes=100, disk_free_bytes=50)
    service = MagicMock()
    service.get = AsyncMock(return_value=health)
    monkeypatch.setattr(system_module, "SystemHealthService", lambda _session, _worker: service)
    response = client.get("/api/v1/admin/system/health")
    assert response.status_code == 200
    assert response.json()["render_worker"]["state"] == "degraded"
    assert "worker_base_url" not in response.text
