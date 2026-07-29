"""管理员全局渲染运维领域模型。"""

from pydantic import BaseModel, ConfigDict, Field

from app.models.render_task import RenderStatus, RenderTask


class QueueTaskSnapshot(BaseModel):
    model_config = ConfigDict(frozen=True)

    task_id: int
    status: RenderStatus
    position: int = Field(ge=0)
    rendered_frames: int | None = Field(default=None, ge=0)
    total_frames: int | None = Field(default=None, ge=0)
    eta_seconds: float | None = Field(default=None, ge=0)


class RenderQueueSnapshot(BaseModel):
    model_config = ConfigDict(frozen=True)

    concurrency: int = Field(ge=1)
    queue_size: int = Field(ge=0)
    avg_fps: float | None = Field(default=None, ge=0)
    tasks: list[QueueTaskSnapshot]


class ActiveRenderTask(BaseModel):
    model_config = ConfigDict(frozen=True)

    task: RenderTask
    queue: QueueTaskSnapshot


class ActiveRenderSnapshot(BaseModel):
    model_config = ConfigDict(frozen=True)

    queue: RenderQueueSnapshot
    tasks: list[ActiveRenderTask]


class RenderHistoryPage(BaseModel):
    model_config = ConfigDict(frozen=True)

    tasks: list[RenderTask]
    total: int = Field(ge=0)
    page: int = Field(ge=1)
    page_size: int = Field(ge=1, le=200)
