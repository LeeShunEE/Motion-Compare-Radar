"""全局渲染队列、历史与管理员操作用例。"""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import RenderOperationConflictError, TaskNotFoundError
from app.dao.render_task_dao import RenderTaskDAO
from app.models.admin_render import (
    ActiveRenderSnapshot,
    ActiveRenderTask,
    RenderHistoryPage,
)
from app.models.audit_event import AuditAction
from app.models.render_task import Codec, RenderMode, RenderStatus, RenderTask
from app.service.audit_service import AuditService
from app.service.file_service import FileService
from app.service.queue_service import RenderQueue


class RenderAdminService:
    """管理员渲染运维的状态约束与审计边界。"""

    def __init__(self, session: AsyncSession, queue: RenderQueue) -> None:
        self._dao = RenderTaskDAO(session)
        self._queue = queue
        self._audit = AuditService(session)
        self._files = FileService(
            settings.storage_root,
            settings.max_user_storage_bytes,
            settings.max_user_upload_count,
        )

    async def active(self) -> ActiveRenderSnapshot:
        snapshot = self._queue.admin_snapshot()
        active: list[ActiveRenderTask] = []
        for queue_task in snapshot.tasks:
            task = await self._dao.get(queue_task.task_id)
            if task is not None:
                active.append(ActiveRenderTask(task=task, queue=queue_task))
        return ActiveRenderSnapshot(queue=snapshot, tasks=active)

    async def history(
        self,
        *,
        user_id: int | None,
        status: RenderStatus | None,
        mode: RenderMode | None,
        codec: Codec | None,
        page: int,
        page_size: int,
    ) -> RenderHistoryPage:
        tasks, total = await self._dao.list_global(
            user_id=user_id,
            status=status,
            mode=mode,
            codec=codec,
            offset=(page - 1) * page_size,
            limit=page_size,
        )
        return RenderHistoryPage(
            tasks=tasks,
            total=total,
            page=page,
            page_size=page_size,
        )

    async def cancel(self, *, actor_user_id: int, task_id: int) -> RenderTask:
        task = await self._require_task(task_id)
        if not task.is_active:
            raise RenderOperationConflictError("仅排队中或运行中的任务可以取消")
        await self._queue.cancel(task_id)
        await self._dao.mark_canceled(task_id)
        updated = await self._require_task(task_id)
        await self._audit.record(
            AuditAction.ADMIN_RENDER_CANCELED,
            actor_user_id=actor_user_id,
            subject_user_id=task.user_id,
            resource_type="render_task",
            resource_id=str(task_id),
            metadata={"status": task.status.value},
        )
        return updated

    async def retry(self, *, actor_user_id: int, task_id: int) -> RenderTask:
        task = await self._require_task(task_id)
        if task.status not in {RenderStatus.FAILED, RenderStatus.CANCELED}:
            raise RenderOperationConflictError("仅失败或已取消的任务可以重试")
        extension = "gif" if task.codec is Codec.GIF else "mp4"
        output_path = self._files.outputs_dir(task.user_id) / f"{uuid.uuid4().hex}.{extension}"
        retried = await self._dao.create(
            user_id=task.user_id,
            mode=task.mode,
            codec=task.codec,
            input_props=task.input_props,
            output_path=str(output_path),
            retry_of_task_id=task.id,
        )
        self._queue.enqueue(retried.id)
        await self._audit.record(
            AuditAction.ADMIN_RENDER_RETRIED,
            actor_user_id=actor_user_id,
            subject_user_id=task.user_id,
            resource_type="render_task",
            resource_id=str(retried.id),
            metadata={"status": task.status.value},
        )
        return retried

    async def _require_task(self, task_id: int) -> RenderTask:
        task = await self._dao.get(task_id)
        if task is None:
            raise TaskNotFoundError(f"任务不存在: id={task_id}")
        return task
