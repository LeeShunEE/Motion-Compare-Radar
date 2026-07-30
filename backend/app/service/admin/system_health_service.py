"""数据库、worker、存储与磁盘的降级式健康检查。"""

import asyncio
import shutil
import time
from pathlib import Path
from uuid import uuid4

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.clients.render_worker_client import RenderWorkerClient
from app.core.config import settings
from app.models.admin_dashboard import (
    ComponentHealth,
    HealthState,
    StorageHealth,
    SystemHealth,
)

_STARTED_AT = time.monotonic()


class SystemHealthService:
    """各子系统独立检查，失败转换为 degraded 而非传播异常。"""

    def __init__(self, session: AsyncSession, worker: RenderWorkerClient) -> None:
        self._session = session
        self._worker = worker

    async def get(self) -> SystemHealth:
        database = await self._database_health()
        worker = await self._worker_health()
        backend_storage = self._storage_health(settings.storage_root)
        public_assets = self._storage_health(settings.public_assets_path)
        render_tmp = self._storage_health(settings.public_assets_path / "_render_tmp")
        try:
            disk = shutil.disk_usage(settings.storage_root)
            disk_total = disk.total
            disk_free = disk.free
            disk_ok = True
        except OSError:
            disk_total = 0
            disk_free = 0
            disk_ok = False
        states = [
            database.state,
            worker.state,
            backend_storage.state,
            public_assets.state,
            render_tmp.state,
        ]
        state = (
            HealthState.HEALTHY
            if disk_ok and all(item is HealthState.HEALTHY for item in states)
            else HealthState.DEGRADED
        )
        return SystemHealth(
            state=state,
            uptime_seconds=max(round(time.monotonic() - _STARTED_AT), 0),
            database=database,
            render_worker=worker,
            backend_storage=backend_storage,
            public_assets=public_assets,
            render_tmp=render_tmp,
            disk_total_bytes=disk_total,
            disk_free_bytes=disk_free,
        )

    async def _database_health(self) -> ComponentHealth:
        started = time.perf_counter()
        try:
            await self._session.execute(text("SELECT 1"))
        except Exception:  # noqa: BLE001 健康端点必须降级而不是泄露基础设施异常
            return ComponentHealth(state=HealthState.DEGRADED, message="database unavailable")
        return ComponentHealth(
            state=HealthState.HEALTHY,
            latency_ms=max(round((time.perf_counter() - started) * 1000), 0),
        )

    async def _worker_health(self) -> ComponentHealth:
        started = time.perf_counter()
        try:
            healthy = await asyncio.wait_for(self._worker.health(), timeout=3)
        except Exception:  # noqa: BLE001 健康端点必须收敛外部依赖异常并返回降级状态
            healthy = False
        return ComponentHealth(
            state=HealthState.HEALTHY if healthy else HealthState.DEGRADED,
            latency_ms=max(round((time.perf_counter() - started) * 1000), 0),
            message=None if healthy else "render worker unavailable",
        )

    @staticmethod
    def _storage_health(path: Path) -> StorageHealth:
        readable = False
        writable = False
        probe = path / f".health-{uuid4().hex}"
        try:
            readable = path.is_dir() and next(path.iterdir(), None) is not None
            if path.is_dir() and not readable:
                readable = True
            probe.write_bytes(b"ok")
            probe.unlink()
            writable = True
        except OSError:
            try:
                probe.unlink(missing_ok=True)
            except OSError:
                pass
        return StorageHealth(
            state=HealthState.HEALTHY if readable and writable else HealthState.DEGRADED,
            readable=readable,
            writable=writable,
        )
