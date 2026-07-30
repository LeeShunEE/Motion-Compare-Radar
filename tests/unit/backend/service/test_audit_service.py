"""审计服务的敏感字段过滤测试。"""

from unittest.mock import AsyncMock

from app.models.audit_event import AuditAction
from app.service.audit_service import AuditService


async def test_record_filters_metadata_to_non_sensitive_allowlist() -> None:
    dao = AsyncMock()
    service = AuditService.__new__(AuditService)
    service._dao = dao

    await service.record(
        AuditAction.RENDER_SUBMITTED,
        actor_user_id=3,
        resource_type="render_task",
        resource_id="9",
        metadata={
            "mode": "single",
            "codec": "h264",
            "token": "must-not-survive",
            "input_props": {"private": "payload"},
        },
    )

    metadata = dao.create.await_args.kwargs["metadata"]
    assert metadata == {"mode": "single", "codec": "h264"}
