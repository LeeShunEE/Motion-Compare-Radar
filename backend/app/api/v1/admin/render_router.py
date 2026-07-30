"""管理员全局渲染队列与历史运维路由。"""

from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import CurrentAdminDep, SessionDep
from app.models.render_task import Codec, RenderMode, RenderStatus
from app.schemas.admin import (
    AdminActiveRenderListResponse,
    AdminRenderHistoryResponse,
    AdminRenderTaskResponse,
)
from app.service.admin.render_admin_service import RenderAdminService
from app.service.queue_service import render_queue

router = APIRouter(prefix="/render")


@router.get("/active", response_model=AdminActiveRenderListResponse)
async def active_renders(
    _current_admin: CurrentAdminDep,
    session: SessionDep,
) -> AdminActiveRenderListResponse:
    return AdminActiveRenderListResponse.from_domain(
        await RenderAdminService(session, render_queue).active()
    )


@router.get("/history", response_model=AdminRenderHistoryResponse)
async def render_history(
    _current_admin: CurrentAdminDep,
    session: SessionDep,
    *,
    user_id: int | None = None,
    status: RenderStatus | None = None,
    mode: RenderMode | None = None,
    codec: Codec | None = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=200)] = 50,
) -> AdminRenderHistoryResponse:
    history = await RenderAdminService(session, render_queue).history(
        user_id=user_id,
        status=status,
        mode=mode,
        codec=codec,
        page=page,
        page_size=page_size,
    )
    return AdminRenderHistoryResponse(
        items=[AdminRenderTaskResponse.from_domain(task) for task in history.tasks],
        total=history.total,
        page=history.page,
        page_size=history.page_size,
    )


@router.post("/{task_id}/cancel", response_model=AdminRenderTaskResponse)
async def cancel_render(
    task_id: int,
    current_admin: CurrentAdminDep,
    session: SessionDep,
) -> AdminRenderTaskResponse:
    task = await RenderAdminService(session, render_queue).cancel(
        actor_user_id=current_admin.id,
        task_id=task_id,
    )
    return AdminRenderTaskResponse.from_domain(task)


@router.post("/{task_id}/retry", response_model=AdminRenderTaskResponse)
async def retry_render(
    task_id: int,
    current_admin: CurrentAdminDep,
    session: SessionDep,
) -> AdminRenderTaskResponse:
    task = await RenderAdminService(session, render_queue).retry(
        actor_user_id=current_admin.id,
        task_id=task_id,
    )
    return AdminRenderTaskResponse.from_domain(task)
