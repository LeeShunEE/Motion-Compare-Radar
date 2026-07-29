"""管理员用户详情所需的聚合领域模型。"""

from pydantic import BaseModel, ConfigDict, Field

from app.models.user import User


class UserUsageSummary(BaseModel):
    """单个用户的存储、渲染与活动汇总。"""

    model_config = ConfigDict(frozen=True)

    upload_count: int = Field(ge=0)
    upload_bytes: int = Field(ge=0)
    output_bytes: int = Field(ge=0)
    render_total: int = Field(ge=0)
    render_done: int = Field(ge=0)
    render_failed: int = Field(ge=0)
    render_canceled: int = Field(ge=0)
    render_success_rate: float = Field(ge=0, le=1)
    activity_count: int = Field(ge=0)
    storage_partial: bool = False


class AdminUserDetail(BaseModel):
    """管理员查看的用户身份和使用汇总。"""

    model_config = ConfigDict(frozen=True)

    user: User
    usage: UserUsageSummary
