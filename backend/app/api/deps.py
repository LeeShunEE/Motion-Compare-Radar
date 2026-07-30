"""FastAPI 公共依赖。"""

from typing import Annotated

from fastapi import Depends, Header
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_session
from app.core.exceptions import AccountDisabledError, AdminRequiredError, AuthError
from app.core.security import TokenType, decode_token
from app.models.user import User
from app.service.user_service import UserService

_bearer = HTTPBearer(auto_error=False)

SessionDep = Annotated[AsyncSession, Depends(get_session)]


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    session: SessionDep,
) -> User:
    """从 Bearer access token 解析当前用户。"""
    if credentials is None:
        raise AuthError("未提供凭证")
    payload = decode_token(credentials.credentials, expected_type=TokenType.ACCESS)
    user_id = int(payload["sub"])
    return await UserService(session).get_by_id(user_id)


AuthenticatedUserDep = Annotated[User, Depends(get_current_user)]


async def get_current_active_user(current_user: AuthenticatedUserDep) -> User:
    """拒绝已停用账号，使状态变更对现有 JWT 立即生效。"""
    if not current_user.is_active:
        raise AccountDisabledError("账号已停用")
    return current_user


CurrentActiveUserDep = Annotated[User, Depends(get_current_active_user)]
# 现有受保护路由自动获得 active 校验，保持公开依赖名称兼容。
CurrentUserDep = CurrentActiveUserDep


async def get_current_admin(current_user: CurrentActiveUserDep) -> User:
    """要求当前 active 用户具有管理员权限。"""
    if not current_user.is_admin:
        raise AdminRequiredError("需要管理员权限")
    return current_user


CurrentAdminDep = Annotated[User, Depends(get_current_admin)]


async def verify_render_callback_token(
    x_render_callback_token: Annotated[str | None, Header()] = None,
) -> None:
    """校验 worker 进度回调的共享密钥（非用户态：worker 不是用户，用密钥而非 JWT）。"""
    expected = settings.render_callback_token_secret_string.get_secret_value()
    if x_render_callback_token != expected:
        raise AuthError("渲染回调令牌无效")


__all__ = [
    "CurrentUserDep",
    "CurrentActiveUserDep",
    "CurrentAdminDep",
    "SessionDep",
    "get_current_active_user",
    "get_current_admin",
    "get_current_user",
    "get_session",
    "verify_render_callback_token",
]
