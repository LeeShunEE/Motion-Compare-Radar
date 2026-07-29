"""管理员公共资源 CRUD 路由。"""

from fastapi import APIRouter, UploadFile, status

from app.api.deps import CurrentAdminDep
from app.core.config import settings
from app.models.public_asset import AssetCategory
from app.schemas.admin import AdminAssetResponse
from app.service.admin.public_asset_service import PublicAssetService

router = APIRouter(prefix="/assets")


def _service() -> PublicAssetService:
    return PublicAssetService(
        settings.public_assets_path,
        settings.max_public_asset_bytes,
    )


@router.get("", response_model=list[AdminAssetResponse])
async def list_assets(
    category: AssetCategory,
    _current_admin: CurrentAdminDep,
) -> list[AdminAssetResponse]:
    """列出指定分类的公共资源。"""
    return [AdminAssetResponse.from_domain(asset) for asset in _service().list(category)]


@router.post(
    "/{category}",
    response_model=AdminAssetResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_asset(
    category: AssetCategory,
    file: UploadFile,
    _current_admin: CurrentAdminDep,
    *,
    overwrite: bool = False,
) -> AdminAssetResponse:
    """创建或显式覆盖公共资源。"""
    data = await file.read(settings.max_public_asset_bytes + 1)
    asset = _service().save(
        category,
        file.filename or "",
        data,
        overwrite=overwrite,
    )
    return AdminAssetResponse.from_domain(asset)


@router.delete("/{category}/{name}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_asset(
    category: AssetCategory,
    name: str,
    _current_admin: CurrentAdminDep,
) -> None:
    """删除指定公共资源。"""
    _service().delete(category, name)
