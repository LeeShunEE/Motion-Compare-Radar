"""管理员用户与权限 API 契约测试。"""

from collections.abc import Iterator
from datetime import UTC, datetime
from importlib import import_module
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from app.api.deps import get_current_admin
from app.core.config import settings
from app.main import app
from app.models.user import User
from app.service.queue_service import render_queue

users_router_module = import_module("app.api.v1.admin.users_router")


def _user(user_id: int, *, is_admin: bool = False) -> User:
    return User(
        id=user_id,
        username=f"user{user_id}",
        email=f"user{user_id}@example.com",
        is_verified=True,
        is_admin=is_admin,
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
    )


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    admin = _user(7, is_admin=True)
    monkeypatch.setattr(settings, "render_queue_autostart", False)
    render_queue.reset()
    app.dependency_overrides[get_current_admin] = lambda: admin
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def test_list_users_returns_bounded_page(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    service = MagicMock()
    service.list_users = AsyncMock(return_value=([_user(2), _user(1)], 2))
    monkeypatch.setattr(users_router_module, "UserAdminService", lambda _session: service)

    response = client.get("/api/v1/admin/users?search=user&page=1&page_size=20")

    assert response.status_code == 200
    assert response.json()["total"] == 2
    assert [item["id"] for item in response.json()["items"]] == [2, 1]


def test_patch_role_uses_authenticated_admin_as_actor(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    service = MagicMock()
    service.set_role = AsyncMock(return_value=_user(9, is_admin=True))
    monkeypatch.setattr(users_router_module, "UserAdminService", lambda _session: service)

    response = client.patch("/api/v1/admin/users/9/role", json={"is_admin": True})

    assert response.status_code == 200
    service.set_role.assert_awaited_once_with(
        actor_user_id=7,
        target_user_id=9,
        is_admin=True,
    )
