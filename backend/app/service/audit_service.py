"""安全审计事件写入服务。"""

from sqlalchemy.ext.asyncio import AsyncSession

from app.dao.audit_event_dao import AuditEventDAO
from app.models.audit_event import AuditAction, AuditEvent, AuditMetadataValue

_ALLOWED_METADATA_KEYS = frozenset(
    {
        "category",
        "codec",
        "error_code",
        "filename",
        "mode",
        "overwrite",
        "role",
        "status",
    }
)


class AuditService:
    """过滤 metadata 后持久化审计事件。"""

    def __init__(self, session: AsyncSession) -> None:
        self._dao = AuditEventDAO(session)

    async def record(
        self,
        action: AuditAction,
        *,
        actor_user_id: int | None = None,
        subject_user_id: int | None = None,
        resource_type: str | None = None,
        resource_id: str | None = None,
        success: bool = True,
        metadata: dict[str, object] | None = None,
    ) -> AuditEvent:
        """只保留允许且为基础标量的 metadata 字段。"""
        safe_metadata: dict[str, AuditMetadataValue] = {}
        for key, value in (metadata or {}).items():
            if key in _ALLOWED_METADATA_KEYS and (
                value is None or isinstance(value, str | int | bool)
            ):
                safe_metadata[key] = value
        return await self._dao.create(
            action=action,
            actor_user_id=actor_user_id,
            subject_user_id=subject_user_id,
            resource_type=resource_type,
            resource_id=resource_id,
            success=success,
            metadata=safe_metadata,
        )
