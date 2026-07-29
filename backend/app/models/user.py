"""用户领域模型。

领域模型不依赖任何边界类型（schemas / ORM）。``User`` 表示对外公开身份，
凭据单独放在 ``UserCredentials``，仅认证流程使用。
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, SecretStr


class User(BaseModel):
    """用户公开身份。

    支持邮箱验证码注册 + OAuth 登录：
    - username 改为可选（OAuth 用户可能无用户名）
    - is_verified 标记邮箱验证状态
    - display_name 存储 OAuth 用户显示名称
    """

    model_config = ConfigDict(frozen=True)

    id: int
    username: str | None = Field(default=None, min_length=3, max_length=64)
    email: EmailStr
    is_verified: bool = False
    is_admin: bool = False
    is_active: bool = True
    display_name: str | None = None
    last_login_at: datetime | None = None
    created_at: datetime


class UserCredentials(BaseModel):
    """认证所需的用户凭据（仅 auth 流程内部使用）。"""

    model_config = ConfigDict(frozen=True)

    user_id: int
    username: str | None  # OAuth 用户可能无用户名
    password_hash_secret_string: SecretStr | None  # OAuth 用户可能无密码


class OAuthAccount(BaseModel):
    """OAuth 账户绑定信息。"""

    model_config = ConfigDict(frozen=True)

    id: int
    user_id: int
    provider: str  # "google" | "github"
    provider_user_id: str
    provider_email: str | None = None
    provider_display_name: str | None = None
    created_at: datetime
