"""审计事件领域模型测试。"""

from datetime import UTC, datetime

import pytest

from app.models.audit_event import AuditAction, AuditEvent


def test_audit_event_is_frozen_and_typed() -> None:
    event = AuditEvent(
        id=1,
        actor_user_id=7,
        subject_user_id=8,
        action=AuditAction.ADMIN_ROLE_GRANTED,
        resource_type="user",
        resource_id="8",
        success=True,
        metadata={"role": "admin"},
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
    )

    assert event.action is AuditAction.ADMIN_ROLE_GRANTED
    with pytest.raises(Exception):
        event.success = False
