"""管理员 API 请求与响应契约。"""

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, EmailStr

from app.models.public_asset import PublicAsset
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


class AdminAssetResponse(BaseModel):
    """管理员资源列表和写操作响应。"""

    category: str
    name: str
    path: str
    size_bytes: int
    modified_at: datetime

    @classmethod
    def from_domain(cls, asset: PublicAsset) -> "AdminAssetResponse":
        return cls(
            category=asset.category.value,
            name=asset.name,
            path=asset.path,
            size_bytes=asset.size_bytes,
            modified_at=asset.modified_at,
        )
