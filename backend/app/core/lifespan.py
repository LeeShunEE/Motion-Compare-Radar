"""应用生命周期：启动队列消费协程 + 重载未完成任务，GC 服务，关闭时清理。"""

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.core.config import settings
from app.core.database import async_session_factory
from app.service.gc_service import output_gc
from app.service.queue_service import render_queue
from app.service.seed_service import seed_dev_account


def _prepare_public_asset_mountpoints() -> None:
    """在只读 worker 父卷挂载前建立两个嵌套卷的挂载点。"""
    for name in ("_render_tmp", "_user_media"):
        (settings.public_assets_path / name).mkdir(parents=True, exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """应用生命周期钩子。

    启动时：
    1. 若 testing 为 True，幂等 seed 测试环境常驻账户（生产不创建）。
    2. 若 render_queue_autostart 为 True，启动消费协程并重载 DB 中未完成任务。
    3. 若 output_gc_enabled 为 True，启动 GC 服务。

    关闭时：反向顺序停止（GC → 队列）。
    """
    _prepare_public_asset_mountpoints()

    # 测试环境常驻账户：仅 testing=True 时 seed（seed_dev_account 内部再次门控，双重防线）
    if settings.testing:
        async with async_session_factory() as session:
            await seed_dev_account(session)

    # 启动顺序：队列 → GC
    if settings.render_queue_autostart:
        await render_queue.reload_pending()
        await render_queue.start()
    if settings.output_gc_enabled:
        await output_gc.start()

    yield

    # 关闭顺序（反向）：GC → 队列
    if settings.output_gc_enabled:
        await output_gc.stop()
    if settings.render_queue_autostart:
        await render_queue.stop()
