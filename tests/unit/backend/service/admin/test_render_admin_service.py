"""管理员渲染运维服务测试。"""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.core.exceptions import RenderOperationConflictError
from app.models.render_task import Codec, RenderMode, RenderStatus, RenderTask
from app.service.admin.render_admin_service import RenderAdminService


def _task(task_id: int, status: RenderStatus) -> RenderTask:
    return RenderTask(id=task_id, user_id=3, mode=RenderMode.SINGLE, codec=Codec.H264, status=status, input_props={"title": "x"}, output_path=f"/tmp/{task_id}.mp4", created_at=datetime(2026, 1, 1, tzinfo=UTC))


def _service(task: RenderTask) -> RenderAdminService:
    service = RenderAdminService.__new__(RenderAdminService)
    service._dao = AsyncMock()
    service._dao.get.side_effect = [task, task.model_copy(update={"status": RenderStatus.CANCELED})]
    service._queue = MagicMock()
    service._audit = AsyncMock()
    service._files = MagicMock()
    service._files.outputs_dir.return_value = __import__("pathlib").Path("/tmp")
    return service


async def test_cancel_active_task_updates_db_queue_and_audit() -> None:
    service = _service(_task(8, RenderStatus.RUNNING))
    result = await service.cancel(actor_user_id=1, task_id=8)
    assert result.status is RenderStatus.CANCELED
    service._queue.cancel.assert_called_once_with(8)
    service._dao.mark_canceled.assert_awaited_once_with(8)
    service._audit.record.assert_awaited_once()


async def test_cancel_terminal_task_conflicts() -> None:
    service = _service(_task(8, RenderStatus.DONE))
    with pytest.raises(RenderOperationConflictError):
        await service.cancel(actor_user_id=1, task_id=8)


async def test_retry_failed_task_creates_linked_independent_task() -> None:
    original = _task(8, RenderStatus.FAILED)
    retried = _task(12, RenderStatus.QUEUED).model_copy(update={"retry_of_task_id": 8})
    service = _service(original)
    service._dao.get.side_effect = [original]
    service._dao.create.return_value = retried
    result = await service.retry(actor_user_id=1, task_id=8)
    assert result.retry_of_task_id == 8
    assert service._dao.create.await_args.kwargs["retry_of_task_id"] == 8
    assert service._dao.create.await_args.kwargs["output_path"] != original.output_path
    service._queue.enqueue.assert_called_once_with(12)


async def test_retry_done_task_conflicts() -> None:
    service = _service(_task(8, RenderStatus.DONE))
    with pytest.raises(RenderOperationConflictError):
        await service.retry(actor_user_id=1, task_id=8)
