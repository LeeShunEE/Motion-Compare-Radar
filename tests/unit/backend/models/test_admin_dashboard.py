"""Dashboard 领域模型测试。"""

from app.models.admin_dashboard import DashboardRange


def test_dashboard_ranges_map_to_stable_windows() -> None:
    assert DashboardRange.HOURS_24.days == 1
    assert DashboardRange.DAYS_7.days == 7
    assert DashboardRange.DAYS_30.days == 30
