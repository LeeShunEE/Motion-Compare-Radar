"""隐私受控的操作审计领域模型。"""

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict


class AuditAction(StrEnum):
    AUTH_LOGIN_SUCCEEDED = "auth.login_succeeded"
    USER_UPLOAD_CREATED = "user.upload_created"
    USER_UPLOAD_REPLACED = "user.upload_replaced"
    USER_UPLOAD_DELETED = "user.upload_deleted"
    RENDER_SUBMITTED = "render.submitted"
    RENDER_CANCELED = "render.canceled"
    RENDER_DELETED = "render.deleted"
    RENDER_DOWNLOADED = "render.downloaded"
    ADMIN_USER_ACTIVATED = "admin.user_activated"
    ADMIN_USER_DEACTIVATED = "admin.user_deactivated"
    ADMIN_ROLE_GRANTED = "admin.role_granted"
    ADMIN_ROLE_REVOKED = "admin.role_revoked"
    ADMIN_ASSET_CREATED = "admin.asset_created"
    ADMIN_ASSET_REPLACED = "admin.asset_replaced"
    ADMIN_ASSET_DELETED = "admin.asset_deleted"
    ADMIN_RENDER_CANCELED = "admin.render_canceled"
    ADMIN_RENDER_RETRIED = "admin.render_retried"


AuditMetadataValue = str | int | bool | None


class AuditEvent(BaseModel):
    """可查询且不携带请求秘密的审计事件。"""

    model_config = ConfigDict(frozen=True)

    id: int
    actor_user_id: int | None = None
    subject_user_id: int | None = None
    action: AuditAction
    resource_type: str | None = None
    resource_id: str | None = None
    success: bool = True
    metadata: dict[str, AuditMetadataValue]
    created_at: datetime
