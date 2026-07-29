"""审计事件数据访问。"""

from datetime import datetime

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dao.orm import AuditEventORM
from app.models.audit_event import AuditAction, AuditEvent, AuditMetadataValue


def _to_domain(orm: AuditEventORM) -> AuditEvent:
    return AuditEvent(
        id=orm.id,
        actor_user_id=orm.actor_user_id,
        subject_user_id=orm.subject_user_id,
        action=AuditAction(orm.action),
        resource_type=orm.resource_type,
        resource_id=orm.resource_id,
        success=orm.success,
        metadata=orm.details,
        created_at=orm.created_at,
    )


class AuditEventDAO:
    """审计事件写入、筛选和保留期清理。"""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(
        self,
        *,
        action: AuditAction,
        actor_user_id: int | None,
        subject_user_id: int | None,
        resource_type: str | None,
        resource_id: str | None,
        success: bool,
        metadata: dict[str, AuditMetadataValue],
    ) -> AuditEvent:
        orm = AuditEventORM(
            action=action.value,
            actor_user_id=actor_user_id,
            subject_user_id=subject_user_id,
            resource_type=resource_type,
            resource_id=resource_id,
            success=success,
            details=metadata,
        )
        self._session.add(orm)
        await self._session.commit()
        await self._session.refresh(orm)
        return _to_domain(orm)

    async def list(
        self,
        *,
        actor_user_id: int | None = None,
        subject_user_id: int | None = None,
        involved_user_id: int | None = None,
        action: AuditAction | None = None,
        success: bool | None = None,
        before_id: int | None = None,
        limit: int = 50,
    ) -> list[AuditEvent]:
        stmt = select(AuditEventORM)
        if actor_user_id is not None:
            stmt = stmt.where(AuditEventORM.actor_user_id == actor_user_id)
        if subject_user_id is not None:
            stmt = stmt.where(AuditEventORM.subject_user_id == subject_user_id)
        if involved_user_id is not None:
            stmt = stmt.where(
                (AuditEventORM.actor_user_id == involved_user_id)
                | (AuditEventORM.subject_user_id == involved_user_id)
            )
        if action is not None:
            stmt = stmt.where(AuditEventORM.action == action.value)
        if success is not None:
            stmt = stmt.where(AuditEventORM.success.is_(success))
        if before_id is not None:
            stmt = stmt.where(AuditEventORM.id < before_id)
        rows = (
            await self._session.execute(
                stmt.order_by(AuditEventORM.id.desc()).limit(limit)
            )
        ).scalars().all()
        return [_to_domain(row) for row in rows]

    async def count_for_user(self, user_id: int) -> int:
        stmt = select(func.count(AuditEventORM.id)).where(
            (AuditEventORM.actor_user_id == user_id)
            | (AuditEventORM.subject_user_id == user_id)
        )
        return int((await self._session.execute(stmt)).scalar_one())

    async def delete_before(self, cutoff: datetime) -> int:
        result = await self._session.execute(
            delete(AuditEventORM).where(AuditEventORM.created_at < cutoff)
        )
        await self._session.commit()
        return int(result.rowcount or 0)

    async def active_user_ids_since(self, cutoff: datetime) -> set[int]:
        stmt = (
            select(AuditEventORM.actor_user_id)
            .where(
                AuditEventORM.actor_user_id.is_not(None),
                AuditEventORM.created_at >= cutoff,
            )
            .distinct()
        )
        return set((await self._session.execute(stmt)).scalars().all())
