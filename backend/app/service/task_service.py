"""任务查询与删除服务（用户态，强制按 user_id 归属校验）。"""

from pathlib import Path

from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import TaskNotFoundError
from app.dao.render_task_dao import RenderTaskDAO
from app.models.render_task import RenderTask
from app.service.queue_service import RenderQueue


class TaskView(BaseModel):
    """任务 + 队列派生信息（排位、ETA、渲染进度、队列规模），供接口层组装响应。"""

    task: RenderTask
    position: int
    eta_seconds: float | None
    rendered_frames: int | None = None
    total_frames: int | None = None
    # 全局队列规模（排队 + 运行中），供排队态展示「共 N 个」。
    queue_size: int = 0


class TaskService:
    """渲染任务用例。"""

    def __init__(self, session: AsyncSession, queue: RenderQueue) -> None:
        self._dao = RenderTaskDAO(session)
        self._queue = queue

    def _view(self, task: RenderTask) -> TaskView:
        progress = self._queue.progress(task.id)
        rendered, total = progress if progress is not None else (None, None)
        return TaskView(
            task=task,
            position=self._queue.position(task.id),
            eta_seconds=self._queue.eta_seconds(task.id),
            rendered_frames=rendered,
            total_frames=total,
            queue_size=self._queue.queue_size(),
        )

    async def list_for_user(self, user_id: int) -> tuple[int, list[TaskView]]:
        """返回（全局队列大小, 该用户任务视图列表）。"""
        tasks = await self._dao.list_for_user(user_id)
        return self._queue.queue_size(), [self._view(t) for t in tasks]

    async def get_for_user(self, task_id: int, user_id: int) -> TaskView:
        task = await self._dao.get_for_user(task_id, user_id)
        if task is None:
            raise TaskNotFoundError(f"任务不存在: id={task_id}")
        return self._view(task)

    async def delete_for_user(self, task_id: int, user_id: int) -> RenderTask:
        """删除任务：活动中先取消，再删行与产物文件。"""
        task = await self._dao.get_for_user(task_id, user_id)
        if task is None:
            raise TaskNotFoundError(f"任务不存在: id={task_id}")
        if task.is_active:
            self._queue.cancel(task_id)
        await self._dao.delete(task_id)
        self._queue.forget(task_id)
        output = Path(task.output_path)
        if output.is_file():
            output.unlink()
        return task
