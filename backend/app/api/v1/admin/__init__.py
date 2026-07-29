"""管理员 API 聚合路由。"""

from fastapi import APIRouter

from app.api.v1.admin.assets_router import router as assets_router
from app.api.v1.admin.audit_router import router as audit_router
from app.api.v1.admin.render_router import router as render_router
from app.api.v1.admin.session_router import router as session_router
from app.api.v1.admin.users_router import router as users_router

router = APIRouter(prefix="/admin", tags=["admin"])
router.include_router(session_router)
router.include_router(assets_router)
router.include_router(users_router)
router.include_router(audit_router)
router.include_router(render_router)

__all__ = ["router"]
