"""管理员 API 请求与响应契约。"""

from enum import StrEnum

from pydantic import BaseModel, EmailStr

from app.models.user import User


class AdminCapability(StrEnum):
    """一期管理员控制台可用能力。"""

    ASSETS_MANAGE = "assets:manage"
    USERS_MANAGE = "users:manage"
    AUDIT_READ = "audit:read"
    RENDERS_MANAGE = "renders:manage"
    SYSTEM_READ = "system:read"


class AdminSessionResponse(BaseModel):
    """管理区初始化所需的最小公开身份。"""

    id: int
    username: str | None
    email: EmailStr
    capabilities: list[AdminCapability]

    @classmethod
    def from_domain(cls, user: User) -> "AdminSessionResponse":
        return cls(
            id=user.id,
            username=user.username,
            email=user.email,
            capabilities=list(AdminCapability),
        )
