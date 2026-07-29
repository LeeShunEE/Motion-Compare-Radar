"""管理员会话路由。"""

from fastapi import APIRouter

from app.api.deps import CurrentAdminDep
from app.schemas.admin import AdminSessionResponse

router = APIRouter()


@router.get("/me", response_model=AdminSessionResponse)
async def admin_me(current_admin: CurrentAdminDep) -> AdminSessionResponse:
    """返回当前管理员公开身份与一期能力集合。"""
    return AdminSessionResponse.from_domain(current_admin)
