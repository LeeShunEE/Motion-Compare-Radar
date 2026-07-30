"""系统健康真实数据库与 mock worker 链路。"""

from collections.abc import Callable
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.clients.render_worker_client import RenderWorkerClient
from app.core.config import settings


def test_system_health_checks_database_storage_and_worker(
    client: TestClient,
    register_user: Callable[..., dict],
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    storage = tmp_path / "storage-health"
    public = tmp_path / "public-health"
    storage.mkdir()
    (public / "_render_tmp").mkdir(parents=True)
    monkeypatch.setattr(settings, "storage_root", storage)
    monkeypatch.setattr(settings, "public_assets_path", public)
    monkeypatch.setattr(settings, "initial_admin_email", "alice@example.com")

    async def _healthy(_self: RenderWorkerClient) -> bool:
        return True

    monkeypatch.setattr(RenderWorkerClient, "health", _healthy)
    tokens = register_user("alice@example.com")
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}

    response = client.get("/api/v1/admin/system/health", headers=headers)

    assert response.status_code == 200
    assert response.json()["state"] == "healthy"
    assert response.json()["database"]["state"] == "healthy"
    assert str(tmp_path) not in response.text
