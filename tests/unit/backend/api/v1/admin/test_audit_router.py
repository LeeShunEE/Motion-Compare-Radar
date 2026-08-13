"""管理员审计查询 API 契约测试。"""

from collections.abc import Iterator
from datetime import UTC, datetime
from importlib import import_module
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from app.api.deps import get_current_admin
from app.core.config import settings
from app.main import app
from app.models.audit_event import AuditAction, AuditEvent
from app.models.user import User
from app.service.queue_service import render_queue

audit_router_module = import_module("app.api.v1.admin.audit_router")


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    admin = User(
        id=7,
        username="operator",
        email="operator@example.com",
        is_admin=True,
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
    )
    monkeypatch.setattr(settings, "render_queue_autostart", False)
    render_queue.reset()
    app.dependency_overrides[get_current_admin] = lambda: admin
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def test_audit_events_return_cursor_page(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    event = AuditEvent(
        id=12,
        actor_user_id=7,
        action=AuditAction.ADMIN_USER_DEACTIVATED,
        resource_type="user",
        resource_id="9",
        metadata={"status": "disabled"},
        created_at=datetime(2026, 1, 2, tzinfo=UTC),
    )
    dao = MagicMock()
    dao.list = AsyncMock(return_value=[event])
    monkeypatch.setattr(audit_router_module, "AuditEventDAO", lambda _session: dao)

    response = client.get("/api/v1/admin/audit-events?limit=20")

    assert response.status_code == 200
    assert response.json()["items"][0]["action"] == "admin.user_deactivated"
    assert response.json()["next_cursor"] == 12


def test_user_activity_includes_actor_and_subject_events(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    dao = MagicMock()
    dao.list = AsyncMock(return_value=[])
    monkeypatch.setattr(audit_router_module, "AuditEventDAO", lambda _session: dao)

    response = client.get("/api/v1/admin/users/9/activity?limit=20")

    assert response.status_code == 200
    dao.list.assert_awaited_once_with(
        involved_user_id=9,
        before_id=None,
        limit=20,
    )


def test_audit_events_forward_involved_user_id(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    dao = MagicMock()
    dao.list = AsyncMock(return_value=[])
    monkeypatch.setattr(audit_router_module, "AuditEventDAO", lambda _session: dao)

    response = client.get("/api/v1/admin/audit-events?involved_user_id=9&limit=20")

    assert response.status_code == 200
    dao.list.assert_awaited_once_with(
        actor_user_id=None,
        subject_user_id=None,
        involved_user_id=9,
        action=None,
        success=None,
        before_id=None,
        limit=20,
    )
