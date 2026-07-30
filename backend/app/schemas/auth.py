"""认证接口契约（接口层 Request/Response）。"""

from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from app.models.user import User


class SendCodeRequest(BaseModel):
    """发送验证码请求。"""

    email: EmailStr
    purpose: str = Field(default="register", pattern="^(register|reset_password)$")


class RegisterRequest(BaseModel):
    """验证码注册请求（改为邮箱验证码注册）。"""

    email: EmailStr
    code: str = Field(min_length=6, max_length=6, pattern="^[0-9]{6}$")


class ResetPasswordRequest(BaseModel):
    """重置密码请求（验证码校验后设新密码，解决邮箱注册用户中断死锁）。"""

    email: EmailStr
    code: str = Field(min_length=6, max_length=6, pattern="^[0-9]{6}$")
    new_password: str = Field(min_length=8, max_length=128)


class RegisterWithPasswordRequest(BaseModel):
    """用户名密码注册请求（保留用于兼容）。"""

    username: str = Field(min_length=3, max_length=64)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    """登录请求（支持用户名或邮箱）。"""

    username: str | None = None
    email: EmailStr | None = None
    password: str

    def get_identifier(self) -> str:
        """获取登录标识（用户名或邮箱）。"""
        return self.username or self.email or ""


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"  # noqa: S105 OAuth2 token 类型字面量，非机密
    is_new_user: bool = False  # OAuth 登录时标记是否首次登录（自动注册）


class OAuthStartResponse(BaseModel):
    """OAuth 授权 URL 响应。"""

    auth_url: str


class OAuthProvidersResponse(BaseModel):
    """已启用的 OAuth provider 探测响应（仅布尔，不含任何 secret）。"""

    google: bool = False
    github: bool = False


class UserResponse(BaseModel):
    id: int
    username: str | None = None
    email: EmailStr
    is_verified: bool = False
    is_admin: bool = False
    is_active: bool = True
    display_name: str | None = None
    last_login_at: datetime | None = None
    created_at: datetime

    @classmethod
    def from_domain(cls, user: User) -> "UserResponse":
        return cls(
            id=user.id,
            username=user.username,
            email=user.email,
            is_verified=user.is_verified,
            is_admin=user.is_admin,
            is_active=user.is_active,
            display_name=user.display_name,
            last_login_at=user.last_login_at,
            created_at=user.created_at,
        )


class SetUsernameRequest(BaseModel):
    """设置用户名请求。"""

    username: str = Field(min_length=3, max_length=64)


class SetPasswordRequest(BaseModel):
    """设置密码请求。"""

    password: str = Field(min_length=8, max_length=128)


class OAuthAccountResponse(BaseModel):
    """OAuth 账户绑定信息响应。"""

    id: int
    provider: str
    provider_email: str | None = None
    provider_display_name: str | None = None
    created_at: datetime
