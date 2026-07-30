"""公共资源只读路由；文件事实来源与管理员 CRUD 共用同一服务。"""

from fastapi import APIRouter
from fastapi.responses import FileResponse as FastAPIFileResponse

from app.core.config import settings
from app.core.exceptions import InvalidFileError, StoredFileNotFoundError
from app.models.public_asset import AssetCategory
from app.schemas.file import AssetResponse
from app.service.admin.public_asset_service import PublicAssetService

router = APIRouter(prefix="/assets", tags=["assets"])


def _service() -> PublicAssetService:
    return PublicAssetService(
        settings.public_assets_path,
        settings.max_public_asset_bytes,
    )


def _responses(category: AssetCategory) -> list[AssetResponse]:
    return [
        AssetResponse(name=asset.name, path=asset.path, size_bytes=asset.size_bytes)
        for asset in _service().list(category)
    ]


@router.get("/silhouettes", response_model=list[AssetResponse])
async def list_silhouettes() -> list[AssetResponse]:
    """列举公共剪影图片。"""
    return _responses(AssetCategory.SILHOUETTES)


@router.get("/music", response_model=list[AssetResponse])
async def list_music() -> list[AssetResponse]:
    """列举公共背景音乐。"""
    return _responses(AssetCategory.MUSIC)


@router.get("/{category}/{name}")
async def get_asset(category: str, name: str) -> FastAPIFileResponse:
    """下载指定公共资源文件。"""
    try:
        asset_category = AssetCategory(category)
    except ValueError as error:
        raise StoredFileNotFoundError(f"未知资源分类: {category}") from error
    try:
        path = _service().path(asset_category, name)
    except InvalidFileError as error:
        # 公开读接口统一隐藏非法名称与不存在文件，避免暴露校验细节。
        raise StoredFileNotFoundError(f"公共资源不存在: {category}/{name}") from error
    return FastAPIFileResponse(path, filename=name)
