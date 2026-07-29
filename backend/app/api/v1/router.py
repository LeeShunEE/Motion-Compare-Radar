from fastapi import APIRouter

from app.api.v1.admin import router as admin_router
from app.api.v1.assets_router import router as assets_router
from app.api.v1.auth_router import router as auth_router
from app.api.v1.files_router import router as files_router
from app.api.v1.internal_router import router as internal_router
from app.api.v1.render_router import router as render_router
from app.api.v1.tasks_router import router as tasks_router

api_router = APIRouter()
api_router.include_router(admin_router)
api_router.include_router(auth_router)
api_router.include_router(files_router)
api_router.include_router(render_router)
api_router.include_router(tasks_router)
api_router.include_router(assets_router)
api_router.include_router(internal_router)


@api_router.get("/health")
async def health_check() -> dict[str, str]:
    """Health check endpoint for Docker and load balancers."""
    return {"status": "healthy", "service": "radar-chart-backend"}
