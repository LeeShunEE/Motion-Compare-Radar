"""渲染任务领域模型。"""

from datetime import datetime
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, ConfigDict


class RenderStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    DONE = "done"
    FAILED = "failed"
    CANCELED = "canceled"


class RenderMode(StrEnum):
    SINGLE = "single"
    MULTI = "multi"


class Codec(StrEnum):
    H264 = "h264"
    GIF = "gif"


_ACTIVE = {RenderStatus.QUEUED, RenderStatus.RUNNING}


class RenderTask(BaseModel):
    """一次渲染任务。"""

    model_config = ConfigDict(frozen=True)

    id: int
    user_id: int
    mode: RenderMode
    codec: Codec
    status: RenderStatus
    # 前端传入的完整图表配置，结构动态、后端不解析其内部字段。
    input_props: dict[str, Any]
    output_path: str
    error: str | None = None
    duration_ms: int | None = None
    created_at: datetime
    started_at: datetime | None = None
    finished_at: datetime | None = None
    retry_of_task_id: int | None = None

    @property
    def is_active(self) -> bool:
        """任务是否仍在队列或运行中（可被取消）。"""
        return self.status in _ACTIVE

    @property
    def has_output(self) -> bool:
        return self.status is RenderStatus.DONE
