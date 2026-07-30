"""管理员 API 请求与响应契约。"""

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, EmailStr, Field

from app.models.admin_dashboard import AdminDashboard, SystemHealth
from app.models.admin_render import ActiveRenderSnapshot, ActiveRenderTask
from app.models.admin_user import AdminUserDetail
from app.models.audit_event import AuditEvent
from app.models.public_asset import PublicAsset
from app.models.render_task import RenderTask
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


class AdminUserResponse(BaseModel):
    id: int
    username: str | None
    email: EmailStr
    is_verified: bool
    is_admin: bool
    is_active: bool
    last_login_at: datetime | None
    created_at: datetime

    @classmethod
    def from_domain(cls, user: User) -> "AdminUserResponse":
        return cls(
            id=user.id,
            username=user.username,
            email=user.email,
            is_verified=user.is_verified,
            is_admin=user.is_admin,
            is_active=user.is_active,
            last_login_at=user.last_login_at,
            created_at=user.created_at,
        )


class AdminUserListResponse(BaseModel):
    items: list[AdminUserResponse]
    total: int = Field(ge=0)
    page: int = Field(ge=1)
    page_size: int = Field(ge=1, le=200)


class AdminUserUsageResponse(BaseModel):
    upload_count: int
    upload_bytes: int
    output_bytes: int
    render_total: int
    render_done: int
    render_failed: int
    render_canceled: int
    render_success_rate: float
    activity_count: int
    storage_partial: bool


class AdminUserDetailResponse(BaseModel):
    user: AdminUserResponse
    usage: AdminUserUsageResponse

    @classmethod
    def from_domain(cls, detail: AdminUserDetail) -> "AdminUserDetailResponse":
        return cls(
            user=AdminUserResponse.from_domain(detail.user),
            usage=AdminUserUsageResponse.model_validate(detail.usage.model_dump()),
        )


class UpdateAdminRoleRequest(BaseModel):
    is_admin: bool


class UpdateUserStatusRequest(BaseModel):
    is_active: bool


class AuditEventResponse(BaseModel):
    id: int
    actor_user_id: int | None
    subject_user_id: int | None
    action: str
    resource_type: str | None
    resource_id: str | None
    success: bool
    metadata: dict[str, str | int | bool | None]
    created_at: datetime

    @classmethod
    def from_domain(cls, event: AuditEvent) -> "AuditEventResponse":
        return cls(
            id=event.id,
            actor_user_id=event.actor_user_id,
            subject_user_id=event.subject_user_id,
            action=event.action.value,
            resource_type=event.resource_type,
            resource_id=event.resource_id,
            success=event.success,
            metadata=event.metadata,
            created_at=event.created_at,
        )


class AuditEventListResponse(BaseModel):
    items: list[AuditEventResponse]
    next_cursor: int | None


class AdminRenderTaskResponse(BaseModel):
    id: int
    user_id: int
    mode: str
    codec: str
    status: str
    output_path: str
    error: str | None
    duration_ms: int | None
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None
    retry_of_task_id: int | None

    @classmethod
    def from_domain(cls, task: RenderTask) -> "AdminRenderTaskResponse":
        return cls(
            id=task.id,
            user_id=task.user_id,
            mode=task.mode.value,
            codec=task.codec.value,
            status=task.status.value,
            output_path=task.output_path,
            error=task.error,
            duration_ms=task.duration_ms,
            created_at=task.created_at,
            started_at=task.started_at,
            finished_at=task.finished_at,
            retry_of_task_id=task.retry_of_task_id,
        )


class AdminActiveRenderResponse(AdminRenderTaskResponse):
    position: int
    rendered_frames: int | None
    total_frames: int | None
    eta_seconds: float | None

    @classmethod
    def from_domain(cls, active: ActiveRenderTask) -> "AdminActiveRenderResponse":
        task = AdminRenderTaskResponse.from_domain(active.task).model_dump()
        return cls(
            **task,
            position=active.queue.position,
            rendered_frames=active.queue.rendered_frames,
            total_frames=active.queue.total_frames,
            eta_seconds=active.queue.eta_seconds,
        )


class AdminActiveRenderListResponse(BaseModel):
    concurrency: int
    queue_size: int
    avg_fps: float | None
    items: list[AdminActiveRenderResponse]

    @classmethod
    def from_domain(cls, snapshot: ActiveRenderSnapshot) -> "AdminActiveRenderListResponse":
        return cls(
            concurrency=snapshot.queue.concurrency,
            queue_size=snapshot.queue.queue_size,
            avg_fps=snapshot.queue.avg_fps,
            items=[AdminActiveRenderResponse.from_domain(item) for item in snapshot.tasks],
        )


class AdminRenderHistoryResponse(BaseModel):
    items: list[AdminRenderTaskResponse]
    total: int = Field(ge=0)
    page: int = Field(ge=1)
    page_size: int = Field(ge=1, le=200)


class AdminDashboardResponse(AdminDashboard):
    """Dashboard 对外契约。"""

    @classmethod
    def from_domain(cls, dashboard: AdminDashboard) -> "AdminDashboardResponse":
        return cls.model_validate(dashboard.model_dump())


class SystemHealthResponse(SystemHealth):
    """系统健康对外契约。"""

    @classmethod
    def from_domain(cls, health: SystemHealth) -> "SystemHealthResponse":
        return cls.model_validate(health.model_dump())
