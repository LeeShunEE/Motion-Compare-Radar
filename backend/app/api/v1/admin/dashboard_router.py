"""管理员运营 Dashboard 路由。"""

from fastapi import APIRouter

from app.api.deps import CurrentAdminDep, SessionDep
from app.models.admin_dashboard import DashboardRange
from app.schemas.admin import AdminDashboardResponse
from app.service.admin.dashboard_service import DashboardService
from app.service.queue_service import render_queue

router = APIRouter()


@router.get("/dashboard", response_model=AdminDashboardResponse)
async def dashboard(
    _current_admin: CurrentAdminDep,
    session: SessionDep,
    range: DashboardRange = DashboardRange.HOURS_24,
) -> AdminDashboardResponse:
    return AdminDashboardResponse.from_domain(
        await DashboardService(session, render_queue).get(range)
    )
