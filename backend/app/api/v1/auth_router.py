"""认证路由：验证码发送、注册、登录、刷新、当前用户、OAuth。"""

import logging

from fastapi import APIRouter, HTTPException, status

from app.api.deps import CurrentUserDep, SessionDep
from app.core.config import settings
from app.core.security import (
    TokenType,
    create_access_token,
    create_refresh_token,
    decode_token,
)
from app.schemas.auth import (
    LoginRequest,
    OAuthAccountResponse,
    OAuthProvidersResponse,
    OAuthStartResponse,
    RefreshRequest,
    RegisterRequest,
    RegisterWithPasswordRequest,
    ResetPasswordRequest,
    SendCodeRequest,
    SetPasswordRequest,
    SetUsernameRequest,
    TokenResponse,
    UserResponse,
)
from app.service.auth_service import AuthService
from app.service.email_service import EmailService
from app.service.oauth_service import OAuthService
from app.service.user_service import UserService
from app.service.verification_service import VerificationService

router = APIRouter(prefix="/auth", tags=["auth"])

logger = logging.getLogger(__name__)


def _issue_tokens(user_id: int, *, is_new_user: bool = False) -> TokenResponse:
    subject = str(user_id)
    return TokenResponse(
        access_token=create_access_token(subject),
        refresh_token=create_refresh_token(subject),
        is_new_user=is_new_user,
    )


@router.post("/send-code", status_code=status.HTTP_200_OK)
async def send_verification_code(
    payload: SendCodeRequest,
    session: SessionDep,
) -> dict[str, str]:
    """发送邮箱验证码。"""
    if payload.purpose == "reset_password":
        # 静默校验：不存在则不生码、不发邮件，统一回"已发送"，不泄露是否注册
        if not await UserService(session).exists_by_email(payload.email):
            logger.info("reset code skipped, email not registered")
            return {"message": "验证码已发送"}

    verification_service = VerificationService(session)
    code = await verification_service.generate_code(payload.email, payload.purpose)

    # 测试环境（TESTING=true）不连真实邮件服务，验证码经 /test/latest-code 取回
    if not settings.testing:
        email_service = EmailService()
        await email_service.send_verification_code(payload.email, code, payload.purpose)

    return {"message": "验证码已发送"}


@router.post(
    "/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED
)
async def register(payload: RegisterRequest, session: SessionDep) -> TokenResponse:
    """验证码验证后注册并自动登录。"""
    auth_service = AuthService(session)
    user = await auth_service.verify_and_register(
        email=payload.email,
        code=payload.code,
    )
    return _issue_tokens(user.id)


@router.post(
    "/register-with-password",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    deprecated=True,
)
async def register_with_password(
    payload: RegisterWithPasswordRequest,
    session: SessionDep,
) -> UserResponse:
    """用户名密码注册（已废弃，保留用于兼容）。"""
    user = await AuthService(session).register_with_password(
        username=payload.username,
        email=payload.email,
        password=payload.password,
    )
    return UserResponse.from_domain(user)


@router.post(
    "/reset-password",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
)
async def reset_password(
    payload: ResetPasswordRequest, session: SessionDep
) -> TokenResponse:
    """验证码校验后重置密码并自动登录。

    邮箱注册用户中断（无密码）走此端点恢复：校验重置验证码 → 设新密码 → 颁发 token。
    前端据返回 token 拉取 user 后，按 username 是否为空决定跳 /welcome 还是 /app。
    """
    user = await AuthService(session).reset_password(
        email=payload.email,
        code=payload.code,
        new_password=payload.new_password,
    )
    return _issue_tokens(user.id)


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, session: SessionDep) -> TokenResponse:
    """登录（支持用户名或邮箱）。"""
    auth_service = AuthService(session)
    user = await auth_service.authenticate(
        username=payload.username,
        email=payload.email,
        password=payload.password,
    )
    return _issue_tokens(user.id)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(payload: RefreshRequest, session: SessionDep) -> TokenResponse:
    token_payload = decode_token(
        payload.refresh_token, expected_type=TokenType.REFRESH
    )
    user = await UserService(session).get_by_id(int(token_payload["sub"]))
    return _issue_tokens(user.id)


@router.get("/me", response_model=UserResponse)
async def me(current_user: CurrentUserDep) -> UserResponse:
    return UserResponse.from_domain(current_user)


@router.post("/set-username", response_model=UserResponse)
async def set_username(
    payload: SetUsernameRequest,
    current_user: CurrentUserDep,
    session: SessionDep,
) -> UserResponse:
    """设置用户名（OAuth 用户首次登录后设置）。"""
    auth_service = AuthService(session)
    user = await auth_service.set_username(current_user.id, payload.username)
    return UserResponse.from_domain(user)


@router.post("/set-password", response_model=UserResponse)
async def set_password(
    payload: SetPasswordRequest,
    current_user: CurrentUserDep,
    session: SessionDep,
) -> UserResponse:
    """设置密码（OAuth 用户后续设置密码）。"""
    auth_service = AuthService(session)
    user = await auth_service.set_password(current_user.id, payload.password)
    return UserResponse.from_domain(user)


# === OAuth 端点 ===


@router.get("/oauth/providers", response_model=OAuthProvidersResponse)
async def oauth_providers() -> OAuthProvidersResponse:
    """探测已启用的 OAuth provider。

    前端据此决定是否渲染对应登录按钮，避免对未配置的 provider 发起请求。

    Returns:
        各 provider 是否已配置（仅布尔，不含 secret）
    """
    return OAuthProvidersResponse(
        google=OAuthService.is_provider_configured("google"),
        github=OAuthService.is_provider_configured("github"),
    )


@router.get("/oauth/{provider}/start", response_model=OAuthStartResponse)
async def oauth_start(provider: str, session: SessionDep) -> OAuthStartResponse:
    """发起 OAuth 流程：生成并落库随机 state（CSRF），返回授权 URL。

    Args:
        provider: "google" | "github"

    Returns:
        OAuth 授权页面 URL，前端应跳转到此 URL
    """
    oauth_service = OAuthService(session)
    auth_url = await oauth_service.start_authorization(provider)
    return OAuthStartResponse(auth_url=auth_url)


@router.get("/oauth/{provider}/callback", response_model=TokenResponse)
async def oauth_callback(
    provider: str,
    code: str,
    state: str,
    session: SessionDep,
) -> TokenResponse:
    """处理 OAuth 回调。

    Args:
        provider: "google" | "github"
        code: OAuth provider 返回的授权码
        state: OAuth state 参数（用于 CSRF 防护）

    Returns:
        JWT tokens + is_new_user 标志
    """
    oauth_service = OAuthService(session)
    user, is_new_user = await oauth_service.handle_callback(provider, code, state)
    return _issue_tokens(user.id, is_new_user=is_new_user)


@router.get("/oauth/accounts", response_model=list[OAuthAccountResponse])
async def list_oauth_accounts(
    current_user: CurrentUserDep,
    session: SessionDep,
) -> list[OAuthAccountResponse]:
    """获取当前用户已绑定的 OAuth 账户列表。"""
    oauth_service = OAuthService(session)
    accounts = await oauth_service.list_oauth_accounts(current_user.id)
    return [
        OAuthAccountResponse(
            id=acc.id,
            provider=acc.provider,
            provider_email=acc.provider_email,
            provider_display_name=acc.provider_display_name,
            created_at=acc.created_at,
        )
        for acc in accounts
    ]


@router.post("/oauth/{provider}/bind", response_model=UserResponse)
async def bind_oauth_account(
    provider: str,
    code: str,
    state: str,
    current_user: CurrentUserDep,
    session: SessionDep,
) -> UserResponse:
    """绑定新的 OAuth 账户（已登录用户）。"""
    oauth_service = OAuthService(session)
    user = await oauth_service.bind_oauth_account(
        current_user.id, provider, code, state
    )
    return UserResponse.from_domain(user)


@router.delete("/oauth/{provider}/unbind", response_model=dict[str, bool])
async def unbind_oauth_account(
    provider: str,
    current_user: CurrentUserDep,
    session: SessionDep,
) -> dict[str, bool]:
    """解绑 OAuth 账户。"""
    oauth_service = OAuthService(session)
    success = await oauth_service.unbind_oauth_account(current_user.id, provider)
    return {"success": success}


# === 测试端点（仅测试环境启用）===


@router.get("/test/latest-code")
async def get_latest_verification_code(
    *,
    email: str,
    purpose: str = "register",
    session: SessionDep,
) -> dict[str, str | None]:
    """获取最新验证码（仅测试环境）。

    通过环境变量 TESTING=true 启用，生产环境返回 404。

    Args:
        email: 目标邮箱
        purpose: 用途（"register" | "reset_password"），默认 "register"

    Returns:
        {"code": "123456"} 或 {"code": null}
    """
    if not settings.testing:
        raise HTTPException(status_code=404, detail="Not found")

    verification_service = VerificationService(session)
    code = await verification_service.get_latest_code(email, purpose)
    return {"code": code}
