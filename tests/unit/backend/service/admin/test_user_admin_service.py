"""管理员用户权限服务测试。"""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.core.exceptions import AdminSafetyError
from app.models.audit_event import AuditAction
from app.models.render_task import Codec, RenderMode, RenderStatus, RenderTask
from app.models.stored_file import StorageUsage
from app.models.user import User
from app.service.admin.user_admin_service import UserAdminService


def _user(
    user_id: int,
    *,
    is_admin: bool,
    is_active: bool = True,
    display_name: str | None = None,
) -> User:
    return User(
        id=user_id,
        username=f"user{user_id}",
        email=f"user{user_id}@example.com",
        is_admin=is_admin,
        is_active=is_active,
        display_name=display_name,
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
    )


def _service(
    dao: AsyncMock, audit: AsyncMock, session: AsyncMock | None = None
) -> UserAdminService:
    service = UserAdminService.__new__(UserAdminService)
    service._session = session or AsyncMock()
    service._user_dao = dao
    service._audit = audit
    return service


def _task(task_id: int, status: RenderStatus) -> RenderTask:
    return RenderTask(
        id=task_id,
        user_id=9,
        mode=RenderMode.SINGLE,
        codec=Codec.H264,
        status=status,
        input_props={},
        output_path=f"/tmp/{task_id}.mp4",
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
    )


async def test_cannot_revoke_own_admin_role() -> None:
    service = _service(AsyncMock(), AsyncMock())
    with pytest.raises(AdminSafetyError):
        await service.set_role(actor_user_id=7, target_user_id=7, is_admin=False)


async def test_cannot_disable_last_active_admin() -> None:
    dao = AsyncMock()
    dao.get_by_id.return_value = _user(7, is_admin=True)
    dao.count_active_admins_for_update.return_value = 1
    service = _service(dao, AsyncMock())

    with pytest.raises(AdminSafetyError):
        await service.set_status(actor_user_id=8, target_user_id=7, is_active=False)

    dao.count_active_admins_for_update.assert_awaited_once()
    dao.set_active.assert_not_awaited()


async def test_role_grant_is_persisted_and_audited() -> None:
    dao = AsyncMock()
    dao.get_by_id.return_value = _user(9, is_admin=False)
    dao.set_admin.return_value = _user(9, is_admin=True)
    audit = AsyncMock()
    service = _service(dao, audit)

    result = await service.set_role(
        actor_user_id=7,
        target_user_id=9,
        is_admin=True,
    )

    assert result.is_admin is True
    dao.set_admin.assert_awaited_once_with(9, is_admin=True, commit=False)
    audit.record.assert_awaited_once_with(
        AuditAction.ADMIN_ROLE_GRANTED,
        actor_user_id=7,
        subject_user_id=9,
        resource_type="user",
        resource_id="9",
        metadata={"role": "admin"},
    )


async def test_role_change_rolls_back_when_audit_write_fails() -> None:
    dao = AsyncMock()
    dao.get_by_id.return_value = _user(9, is_admin=False)
    dao.set_admin.return_value = _user(9, is_admin=True)
    audit = AsyncMock()
    audit.record.side_effect = RuntimeError("audit unavailable")
    session = AsyncMock()
    service = _service(dao, audit, session)

    with pytest.raises(RuntimeError, match="audit unavailable"):
        await service.set_role(actor_user_id=7, target_user_id=9, is_admin=True)

    session.rollback.assert_awaited_once()


async def test_user_detail_aggregates_storage_renders_and_activity() -> None:
    dao = AsyncMock()
    dao.get_by_id.return_value = _user(9, is_admin=False, display_name="Alice From Google")
    service = _service(dao, AsyncMock())
    service._render_dao = AsyncMock()
    service._render_dao.list_for_user.return_value = [
        _task(1, RenderStatus.DONE),
        _task(2, RenderStatus.FAILED),
        _task(3, RenderStatus.QUEUED),
    ]
    service._audit_dao = AsyncMock()
    service._audit_dao.count_for_user.return_value = 14
    service._files = MagicMock()
    service._files.usage.return_value = StorageUsage(
        used_bytes=120,
        limit_bytes=1_000,
        upload_count=3,
        upload_limit=10,
    )
    service._files.output_usage_bytes.return_value = 900

    detail = await service.get_user_detail(9)

    assert detail.usage.upload_count == 3
    assert detail.usage.upload_bytes == 120
    assert detail.usage.output_bytes == 900
    assert detail.usage.render_total == 3
    assert detail.usage.render_success_rate == 0.5
    assert detail.usage.activity_count == 14
    assert detail.usage.storage_partial is False
    assert detail.user.display_name == "Alice From Google"


async def test_user_detail_marks_storage_scan_as_partial() -> None:
    dao = AsyncMock()
    dao.get_by_id.return_value = _user(9, is_admin=False)
    service = _service(dao, AsyncMock())
    service._render_dao = AsyncMock()
    service._render_dao.list_for_user.return_value = []
    service._audit_dao = AsyncMock()
    service._audit_dao.count_for_user.return_value = 0
    service._files = MagicMock()
    service._files.usage.side_effect = OSError("volume unavailable")

    detail = await service.get_user_detail(9)

    assert detail.usage.storage_partial is True
    assert detail.usage.upload_bytes == 0
    assert detail.usage.output_bytes == 0
