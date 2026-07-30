"""管理员系统健康路由。"""

from fastapi import APIRouter

from app.api.deps import CurrentAdminDep, SessionDep
from app.clients.render_worker_client import RenderWorkerClient
from app.core.config import settings
from app.schemas.admin import SystemHealthResponse
from app.service.admin.system_health_service import SystemHealthService

router = APIRouter(prefix="/system")


@router.get("/health", response_model=SystemHealthResponse)
async def system_health(
    _current_admin: CurrentAdminDep,
    session: SessionDep,
) -> SystemHealthResponse:
    worker = RenderWorkerClient(
        settings.worker_base_url,
        3,
        settings.render_callback_token_secret_string,
    )
    return SystemHealthResponse.from_domain(
        await SystemHealthService(session, worker).get()
    )
