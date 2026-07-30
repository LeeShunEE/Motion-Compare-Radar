"""管理员用户与权限路由。"""

from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import CurrentAdminDep, SessionDep
from app.schemas.admin import (
    AdminUserDetailResponse,
    AdminUserListResponse,
    AdminUserResponse,
    UpdateAdminRoleRequest,
    UpdateUserStatusRequest,
)
from app.service.admin.user_admin_service import UserAdminService

router = APIRouter(prefix="/users")


@router.get("", response_model=AdminUserListResponse)
async def list_users(
    _current_admin: CurrentAdminDep,
    session: SessionDep,
    *,
    search: str | None = None,
    is_admin: bool | None = None,
    is_active: bool | None = None,
    is_verified: bool | None = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=200)] = 50,
) -> AdminUserListResponse:
    """搜索并筛选用户。"""
    users, total = await UserAdminService(session).list_users(
        search=search,
        is_admin=is_admin,
        is_active=is_active,
        is_verified=is_verified,
        page=page,
        page_size=page_size,
    )
    return AdminUserListResponse(
        items=[AdminUserResponse.from_domain(user) for user in users],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{user_id}", response_model=AdminUserDetailResponse)
async def get_user(
    user_id: int,
    _current_admin: CurrentAdminDep,
    session: SessionDep,
) -> AdminUserDetailResponse:
    return AdminUserDetailResponse.from_domain(
        await UserAdminService(session).get_user_detail(user_id)
    )


@router.patch("/{user_id}/role", response_model=AdminUserResponse)
async def update_role(
    user_id: int,
    payload: UpdateAdminRoleRequest,
    current_admin: CurrentAdminDep,
    session: SessionDep,
) -> AdminUserResponse:
    user = await UserAdminService(session).set_role(
        actor_user_id=current_admin.id,
        target_user_id=user_id,
        is_admin=payload.is_admin,
    )
    return AdminUserResponse.from_domain(user)


@router.patch("/{user_id}/status", response_model=AdminUserResponse)
async def update_status(
    user_id: int,
    payload: UpdateUserStatusRequest,
    current_admin: CurrentAdminDep,
    session: SessionDep,
) -> AdminUserResponse:
    user = await UserAdminService(session).set_status(
        actor_user_id=current_admin.id,
        target_user_id=user_id,
        is_active=payload.is_active,
    )
    return AdminUserResponse.from_domain(user)
