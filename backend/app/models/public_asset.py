"""公共剪影与音乐资源领域模型。"""

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field, computed_field


class AssetCategory(StrEnum):
    """一期支持的固定公共资源分类。"""

    SILHOUETTES = "silhouettes"
    MUSIC = "music"


class PublicAsset(BaseModel):
    """公共资源文件的公开元数据。"""

    model_config = ConfigDict(frozen=True)

    category: AssetCategory
    name: str = Field(min_length=1)
    size_bytes: int = Field(ge=0)
    modified_at: datetime

    @computed_field
    @property
    def path(self) -> str:
        """返回浏览器可使用的分类相对路径。"""
        return f"{self.category.value}/{self.name}"
