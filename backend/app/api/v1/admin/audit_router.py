"""管理员审计事件查询路由。"""

from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import CurrentAdminDep, SessionDep
from app.dao.audit_event_dao import AuditEventDAO
from app.models.audit_event import AuditAction
from app.schemas.admin import AuditEventListResponse, AuditEventResponse

router = APIRouter()


@router.get("/audit-events", response_model=AuditEventListResponse)
async def list_audit_events(
    _current_admin: CurrentAdminDep,
    session: SessionDep,
    *,
    actor_user_id: int | None = None,
    subject_user_id: int | None = None,
    action: AuditAction | None = None,
    success: bool | None = None,
    before_id: int | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> AuditEventListResponse:
    events = await AuditEventDAO(session).list(
        actor_user_id=actor_user_id,
        subject_user_id=subject_user_id,
        action=action,
        success=success,
        before_id=before_id,
        limit=limit,
    )
    return AuditEventListResponse(
        items=[AuditEventResponse.from_domain(event) for event in events],
        next_cursor=events[-1].id if events else None,
    )


@router.get("/users/{user_id}/activity", response_model=AuditEventListResponse)
async def user_activity(
    user_id: int,
    _current_admin: CurrentAdminDep,
    session: SessionDep,
    before_id: int | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> AuditEventListResponse:
    events = await AuditEventDAO(session).list(
        involved_user_id=user_id,
        before_id=before_id,
        limit=limit,
    )
    return AuditEventListResponse(
        items=[AuditEventResponse.from_domain(event) for event in events],
        next_cursor=events[-1].id if events else None,
    )
