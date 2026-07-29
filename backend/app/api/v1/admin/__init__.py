"""管理员 API 聚合路由。"""

from fastapi import APIRouter

from app.api.v1.admin.assets_router import router as assets_router
from app.api.v1.admin.session_router import router as session_router

router = APIRouter(prefix="/admin", tags=["admin"])
router.include_router(session_router)
router.include_router(assets_router)

__all__ = ["router"]
