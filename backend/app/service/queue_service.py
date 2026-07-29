"""服务端渲染的进程内全局队列。

并发由 ``concurrency`` 个消费协程实现（等价于固定大小信号量），数量来自启动配置。
任务状态落库（DAO），队列顺序/运行态/滚动平均耗时维护在内存，用于计算排位与 ETA。
消费协程使用自己的会话工厂（与请求作用域会话无关）。
"""

import asyncio
import time
from collections import deque
from collections.abc import Callable
from statistics import fmean

from sqlalchemy.ext.asyncio import AsyncSession

from app.clients.render_worker_client import RenderWorkerClient, WorkerRenderRequest
from app.core.config import settings
from app.core.database import async_session_factory
from app.core.exceptions import RenderFailedError
from app.dao.render_task_dao import RenderTaskDAO
from app.models.admin_render import QueueTaskSnapshot, RenderQueueSnapshot
from app.models.render_task import RenderStatus
from app.service.silhouette_rewrite import cleanup_render_tmp

# 没有历史样本时的单任务耗时兜底估计（秒）。
_DEFAULT_DURATION_SECONDS = 60.0

SessionFactory = Callable[[], AsyncSession]


class RenderQueue:
    """进程内渲染队列与并发控制。"""

    def __init__(
        self,
        concurrency: int,
        worker: RenderWorkerClient,
        session_factory: SessionFactory,
    ) -> None:
        self._concurrency = max(concurrency, 1)
        self._worker = worker
        self._session_factory = session_factory
        self._queue: asyncio.Queue[int] = asyncio.Queue()
        self._pending: list[int] = []  # 已排队但未开始的任务 id（有序）
        self._running: dict[int, float] = {}  # 运行中任务 id -> 起始 monotonic
        # 运行中任务 id -> (已渲染帧, 总帧)，由 worker 旁路回调更新（瞬时内存态）。
        self._progress: dict[int, tuple[int, int]] = {}
        self._canceled: set[int] = set()
        self._durations: deque[float] = deque(maxlen=20)
        # 近期渲染速度（帧/秒）滚动样本，进程级内存态：启动空、退出随进程清除。
        self._fps_samples: deque[float] = deque(maxlen=20)
        self._consumers: list[asyncio.Task[None]] = []

    # ---- 入队 / 取消 / 清理（内存态，供请求路径调用） ----

    def enqueue(self, task_id: int) -> None:
        self._pending.append(task_id)
        self._queue.put_nowait(task_id)

    def cancel(self, task_id: int) -> None:
        """标记取消：排队中的会被消费者跳过，运行中的会在渲染结束后丢弃产物。"""
        self._canceled.add(task_id)
        if task_id in self._pending:
            self._pending.remove(task_id)

    def forget(self, task_id: int) -> None:
        """从内存态彻底移除（删除任务时调用）。"""
        self._canceled.discard(task_id)
        if task_id in self._pending:
            self._pending.remove(task_id)
        self._running.pop(task_id, None)
        self._progress.pop(task_id, None)

    def reset(self) -> None:
        """清空全部内存态（测试隔离用）。"""
        self._pending.clear()
        self._running.clear()
        self._progress.clear()
        self._canceled.clear()
        self._durations.clear()
        self._fps_samples.clear()
        while not self._queue.empty():
            self._queue.get_nowait()

    # ---- 渲染进度（worker 旁路回调写入，GET /tasks 读取） ----

    def update_progress(self, task_id: int, rendered: int, total: int) -> None:
        """记录运行中任务的逐帧进度；非运行中任务的上报（迟到/越权）一律忽略。"""
        if task_id in self._running:
            self._progress[task_id] = (rendered, total)

    def progress(self, task_id: int) -> tuple[int, int] | None:
        """返回 (已渲染帧, 总帧)；无进度时返回 None。"""
        return self._progress.get(task_id)

    # ---- 排位 / ETA 计算 ----

    def average_duration(self) -> float:
        return fmean(self._durations) if self._durations else _DEFAULT_DURATION_SECONDS

    def record_render_speed(self, total_frames: int, duration_ms: int) -> None:
        """记录一次渲染的瞬时速度（帧/秒）；0 帧或 0ms 忽略，避免除零与噪声。"""
        if total_frames > 0 and duration_ms > 0:
            self._fps_samples.append(total_frames / (duration_ms / 1000))

    def average_fps(self) -> float | None:
        """近期平均渲速（帧/秒）；无样本时返回 None（前端降级为「统计中」）。"""
        return fmean(self._fps_samples) if self._fps_samples else None

    def queue_size(self) -> int:
        return len(self._pending) + len(self._running)

    def admin_snapshot(self) -> RenderQueueSnapshot:
        """复制当前队列状态，避免向管理接口暴露可变内部容器。"""
        tasks = [
            QueueTaskSnapshot(
                task_id=task_id,
                status=RenderStatus.RUNNING,
                position=0,
                rendered_frames=self._progress.get(task_id, (None, None))[0],
                total_frames=self._progress.get(task_id, (None, None))[1],
                eta_seconds=self.eta_seconds(task_id),
            )
            for task_id in self._running
        ]
        tasks.extend(
            QueueTaskSnapshot(
                task_id=task_id,
                status=RenderStatus.QUEUED,
                position=position,
                eta_seconds=self.eta_seconds(task_id),
            )
            for position, task_id in enumerate(self._pending, start=1)
        )
        return RenderQueueSnapshot(
            concurrency=self._concurrency,
            queue_size=len(tasks),
            avg_fps=self.average_fps(),
            tasks=tasks,
        )

    def position(self, task_id: int) -> int:
        """1 基排位（排队中）；运行中或已结束返回 0。"""
        if task_id in self._pending:
            return self._pending.index(task_id) + 1
        return 0

    def eta_seconds(self, task_id: int) -> float | None:
        """预计还需多少秒完成；非活动任务返回 None。"""
        avg = self.average_duration()
        if task_id in self._running:
            elapsed = time.monotonic() - self._running[task_id]
            return max(avg - elapsed, 0.0)
        if task_id in self._pending:
            ahead = self._pending.index(task_id)
            start_in = ((ahead + len(self._running)) / self._concurrency) * avg
            return start_in + avg
        return None

    # ---- 后台消费 ----

    async def start(self) -> None:
        if self._consumers:
            return
        self._consumers = [
            asyncio.create_task(self._consume()) for _ in range(self._concurrency)
        ]

    async def stop(self) -> None:
        for consumer in self._consumers:
            consumer.cancel()
        for consumer in self._consumers:
            try:  # noqa: SIM105
                await consumer
            except asyncio.CancelledError:
                pass
        self._consumers.clear()

    async def reload_pending(self) -> None:
        """重启恢复：running 重置为 queued，再把所有 queued 按序入队。"""
        async with self._session_factory() as session:
            dao = RenderTaskDAO(session)
            await dao.requeue_running()
            ids = await dao.list_queued_ids()
        for task_id in ids:
            self.enqueue(task_id)

    async def _consume(self) -> None:
        while True:
            task_id = await self._queue.get()
            try:
                await self._process_one(task_id)
            except Exception:  # noqa: BLE001,S110 后台循环不能因单任务异常退出
                pass
            finally:
                self._queue.task_done()

    async def _process_one(self, task_id: int) -> None:
        if task_id in self._canceled:
            self._canceled.discard(task_id)
            return
        if task_id in self._pending:
            self._pending.remove(task_id)
        self._running[task_id] = time.monotonic()
        task = None
        try:
            async with self._session_factory() as session:
                dao = RenderTaskDAO(session)
                task = await dao.get(task_id)
                if task is None:
                    return
                await dao.mark_running(task_id)
                request = WorkerRenderRequest(
                    task_id=task_id,
                    mode=task.mode.value,
                    codec=task.codec.value,
                    output_path=task.output_path,
                    input_props=task.input_props,
                )
                started = time.monotonic()
                try:
                    result = await self._worker.render(request)
                except RenderFailedError as exc:
                    await dao.mark_failed(task_id, exc.message)
                    return
                self._durations.append(time.monotonic() - started)
                # 同一处记录渲速：用 worker 权威的帧数 + 渲染耗时，避免 fire-and-forget
                # 进度回调的竞态。
                self.record_render_speed(result.total_frames, result.duration_ms)
                if task_id in self._canceled:
                    self._canceled.discard(task_id)
                    await dao.mark_canceled(task_id)
                    return
                await dao.mark_done(
                    task_id, result.output_path, result.duration_ms
                )
        finally:
            self._running.pop(task_id, None)
            self._progress.pop(task_id, None)
            # 清理 silhouette rewrite 产生的临时文件（worker 已读完）。
            if task is not None:
                cleanup_render_tmp(task.input_props, settings.public_assets_path)


# 进程内单例：请求路径与后台消费共享同一队列状态。
render_queue = RenderQueue(
    concurrency=settings.render_concurrency,
    worker=RenderWorkerClient(
        settings.worker_base_url, settings.render_timeout_seconds
    ),
    session_factory=async_session_factory,
)
