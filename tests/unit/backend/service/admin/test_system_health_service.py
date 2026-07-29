"""系统健康服务降级测试。"""

from pathlib import Path
from unittest.mock import AsyncMock

import pytest

from app.core.config import settings
from app.models.admin_dashboard import HealthState
from app.service.admin.system_health_service import SystemHealthService


async def test_all_components_healthy_without_exposing_paths(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    storage = tmp_path / "storage"
    public = tmp_path / "public"
    render_tmp = public / "_render_tmp"
    storage.mkdir()
    render_tmp.mkdir(parents=True)
    monkeypatch.setattr(settings, "storage_root", storage)
    monkeypatch.setattr(settings, "public_assets_path", public)
    session = AsyncMock()
    worker = AsyncMock()
    worker.health.return_value = True

    health = await SystemHealthService(session, worker).get()

    assert health.state is HealthState.HEALTHY
    assert health.database.state is HealthState.HEALTHY
    assert health.render_worker.state is HealthState.HEALTHY
    assert health.uptime_seconds >= 0
    assert health.disk_total_bytes > 0
    assert health.disk_free_bytes > 0
    assert str(tmp_path) not in health.model_dump_json()


async def test_worker_timeout_and_missing_storage_are_degraded(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "storage_root", tmp_path / "missing")
    monkeypatch.setattr(settings, "public_assets_path", tmp_path / "missing-public")
    session = AsyncMock()
    worker = AsyncMock()
    worker.health.side_effect = TimeoutError

    health = await SystemHealthService(session, worker).get()

    assert health.state is HealthState.DEGRADED
    assert health.render_worker.state is HealthState.DEGRADED
    assert health.backend_storage.writable is False


async def test_database_and_unexpected_worker_failures_are_degraded(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    storage = tmp_path / "storage"
    public = tmp_path / "public"
    storage.mkdir()
    (public / "_render_tmp").mkdir(parents=True)
    monkeypatch.setattr(settings, "storage_root", storage)
    monkeypatch.setattr(settings, "public_assets_path", public)
    session = AsyncMock()
    session.execute.side_effect = RuntimeError("database DSN must not leak")
    worker = AsyncMock()
    worker.health.side_effect = RuntimeError("worker URL must not leak")

    health = await SystemHealthService(session, worker).get()

    assert health.state is HealthState.DEGRADED
    assert health.database.message == "database unavailable"
    assert health.render_worker.message == "render worker unavailable"
    assert "must not leak" not in health.model_dump_json()


def test_read_only_storage_is_reported_as_degraded(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(Path, "write_bytes", lambda path, data: (_ for _ in ()).throw(PermissionError()))

    health = SystemHealthService._storage_health(tmp_path)

    assert health.state is HealthState.DEGRADED
    assert health.readable is True
    assert health.writable is False
