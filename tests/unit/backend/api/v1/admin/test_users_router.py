"""管理员用户与权限 API 契约测试。"""

from collections.abc import Iterator
from datetime import UTC, datetime
from importlib import import_module
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from app.api.deps import get_current_admin
from app.core.config import settings
from app.core.exceptions import UserNotFoundError
from app.main import app
from app.models.admin_user import AdminUserDetail, UserUsageSummary
from app.models.user import User
from app.service.queue_service import render_queue

users_router_module = import_module("app.api.v1.admin.users_router")


def _user(user_id: int, *, is_admin: bool = False, display_name: str | None = None) -> User:
    return User(
        id=user_id,
        username=f"user{user_id}",
        email=f"user{user_id}@example.com",
        is_verified=True,
        is_admin=is_admin,
        display_name=display_name,
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
    )


def _usage() -> UserUsageSummary:
    return UserUsageSummary(
        upload_count=2,
        upload_bytes=2048,
        output_bytes=4096,
        render_total=4,
        render_done=3,
        render_failed=1,
        render_canceled=0,
        render_success_rate=0.75,
        activity_count=12,
        storage_partial=False,
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


def test_get_user_serializes_display_name_and_usage(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    service = MagicMock()
    service.get_user_detail = AsyncMock(
        return_value=AdminUserDetail(
            user=_user(9, display_name="Alice From Google"),
            usage=_usage(),
        )
    )
    monkeypatch.setattr(users_router_module, "UserAdminService", lambda _session: service)

    response = client.get("/api/v1/admin/users/9")

    assert response.status_code == 200
    body = response.json()
    assert body["user"]["display_name"] == "Alice From Google"
    assert body["user"]["email"] == "user9@example.com"
    assert body["usage"]["render_total"] == 4
    assert body["usage"]["activity_count"] == 12


def test_get_user_missing_returns_404(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    service = MagicMock()
    service.get_user_detail = AsyncMock(side_effect=UserNotFoundError("用户不存在: id=99"))
    monkeypatch.setattr(users_router_module, "UserAdminService", lambda _session: service)

    response = client.get("/api/v1/admin/users/99")

    assert response.status_code == 404
    assert response.json()["code"] == "user_not_found"
