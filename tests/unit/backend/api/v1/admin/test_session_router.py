"""管理员会话接口契约测试。"""

from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

from app.api.deps import get_current_admin
from app.core.config import settings
from app.main import app
from app.models.user import User
from app.service.queue_service import render_queue


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    user = User(
        id=7,
        username="operator",
        email="operator@example.com",
        is_verified=True,
        is_admin=True,
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
    )
    monkeypatch.setattr(settings, "render_queue_autostart", False)
    render_queue.reset()
    app.dependency_overrides[get_current_admin] = lambda: user
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def test_admin_me_returns_public_identity_and_capabilities(client: TestClient) -> None:
    response = client.get("/api/v1/admin/me")

    assert response.status_code == 200
    assert response.json() == {
        "id": 7,
        "username": "operator",
        "email": "operator@example.com",
        "capabilities": [
            "assets:manage",
            "users:manage",
            "audit:read",
            "renders:manage",
            "system:read",
        ],
    }
