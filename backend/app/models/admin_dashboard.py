"""管理员 Dashboard 与系统健康领域模型。"""

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field


class DashboardRange(StrEnum):
    HOURS_24 = "24h"
    DAYS_7 = "7d"
    DAYS_30 = "30d"

    @property
    def days(self) -> int:
        return {self.HOURS_24: 1, self.DAYS_7: 7, self.DAYS_30: 30}[self]


class UserMetrics(BaseModel):
    model_config = ConfigDict(frozen=True)
    total: int = Field(ge=0)
    admins: int = Field(ge=0)
    verified: int = Field(ge=0)
    active: int = Field(ge=0)


class RenderMetrics(BaseModel):
    model_config = ConfigDict(frozen=True)
    submitted: int = Field(ge=0)
    queued: int = Field(ge=0)
    running: int = Field(ge=0)
    done: int = Field(ge=0)
    failed: int = Field(ge=0)
    canceled: int = Field(ge=0)
    success_rate: float = Field(ge=0, le=1)
    avg_queue_ms: int = Field(ge=0)
    p95_queue_ms: int = Field(ge=0)
    avg_render_ms: int = Field(ge=0)
    p95_render_ms: int = Field(ge=0)


class QueueMetrics(BaseModel):
    model_config = ConfigDict(frozen=True)
    pending: int = Field(ge=0)
    running: int = Field(ge=0)
    concurrency: int = Field(ge=1)
    avg_fps: float | None = Field(default=None, ge=0)


class StorageBucket(BaseModel):
    model_config = ConfigDict(frozen=True)
    count: int = Field(ge=0)
    bytes: int = Field(ge=0)
    partial: bool = False


class StorageMetrics(BaseModel):
    model_config = ConfigDict(frozen=True)
    uploads: StorageBucket
    outputs: StorageBucket
    public_assets: StorageBucket


class RenderFailure(BaseModel):
    model_config = ConfigDict(frozen=True)
    task_id: int
    user_id: int
    error_code: str
    created_at: datetime


class ErrorAggregate(BaseModel):
    model_config = ConfigDict(frozen=True)
    error_code: str
    count: int = Field(ge=1)


class AdminDashboard(BaseModel):
    model_config = ConfigDict(frozen=True)
    range: DashboardRange
    users: UserMetrics
    renders: RenderMetrics
    queue: QueueMetrics
    storage: StorageMetrics
    recent_failures: list[RenderFailure]
    top_errors: list[ErrorAggregate]


class HealthState(StrEnum):
    HEALTHY = "healthy"
    DEGRADED = "degraded"


class ComponentHealth(BaseModel):
    model_config = ConfigDict(frozen=True)
    state: HealthState
    latency_ms: int | None = Field(default=None, ge=0)
    message: str | None = None


class StorageHealth(BaseModel):
    model_config = ConfigDict(frozen=True)
    state: HealthState
    readable: bool
    writable: bool


class SystemHealth(BaseModel):
    model_config = ConfigDict(frozen=True)
    state: HealthState
    uptime_seconds: int = Field(ge=0)
    database: ComponentHealth
    render_worker: ComponentHealth
    backend_storage: StorageHealth
    public_assets: StorageHealth
    render_tmp: StorageHealth
    disk_total_bytes: int = Field(ge=0)
    disk_free_bytes: int = Field(ge=0)
