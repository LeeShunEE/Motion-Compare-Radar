"""service/task_service.py 单元测试（DAO + 队列全 mock）。"""

from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.core.exceptions import TaskNotFoundError
from app.models.render_task import Codec, RenderMode, RenderStatus, RenderTask
from app.service.task_service import TaskService


def _make_task(**overrides) -> RenderTask:
    defaults = {
        "id": 1,
        "user_id": 10,
        "mode": RenderMode.SINGLE,
        "codec": Codec.H264,
        "status": RenderStatus.QUEUED,
        "input_props": {},
        "output_path": "/tmp/out.mp4",
    }
    defaults["created_at"] = datetime(2026, 1, 1, tzinfo=UTC)
    defaults.update(overrides)
    return RenderTask(**defaults)


def _make_service(dao: AsyncMock, queue: MagicMock) -> TaskService:
    service = TaskService.__new__(TaskService)
    service._dao = dao
    service._queue = queue
    return service


class TestListForUser:
    async def test_returns_queue_size_and_views(self):
        dao = AsyncMock()
        task_a = _make_task(id=1)
        task_b = _make_task(id=2)
        dao.list_for_user.return_value = [task_a, task_b]
        queue = MagicMock()
        queue.queue_size.return_value = 5
        queue.position.side_effect = lambda tid: {1: 1, 2: 2}[tid]
        queue.eta_seconds.return_value = 30.0
        queue.progress.return_value = None
        service = _make_service(dao, queue)

        size, views = await service.list_for_user(user_id=10)

        assert size == 5
        assert len(views) == 2
        assert views[0].task.id == 1
        assert views[0].position == 1
        assert views[0].eta_seconds == 30.0


class TestView:
    async def test_view_includes_progress_when_queue_has_it(self):
        dao = AsyncMock()
        dao.get_for_user.return_value = _make_task()
        queue = MagicMock()
        queue.position.return_value = 0
        queue.eta_seconds.return_value = 12.0
        queue.progress.return_value = (30, 120)
        queue.queue_size.return_value = 3
        service = _make_service(dao, queue)

        view = await service.get_for_user(task_id=1, user_id=10)
        assert view.rendered_frames == 30
        assert view.total_frames == 120

    async def test_view_progress_none_when_queue_empty(self):
        dao = AsyncMock()
        dao.get_for_user.return_value = _make_task()
        queue = MagicMock()
        queue.position.return_value = 0
        queue.eta_seconds.return_value = None
        queue.progress.return_value = None
        queue.queue_size.return_value = 0
        service = _make_service(dao, queue)

        view = await service.get_for_user(task_id=1, user_id=10)
        assert view.rendered_frames is None
        assert view.total_frames is None
        assert view.queue_size == 0


class TestGetForUser:
    async def test_found(self):
        dao = AsyncMock()
        dao.get_for_user.return_value = _make_task()
        queue = MagicMock()
        queue.position.return_value = 0
        queue.eta_seconds.return_value = None
        queue.progress.return_value = None
        queue.queue_size.return_value = 1
        service = _make_service(dao, queue)

        view = await service.get_for_user(task_id=1, user_id=10)
        assert view.task.id == 1

    async def test_not_found_raises(self):
        dao = AsyncMock()
        dao.get_for_user.return_value = None
        queue = MagicMock()
        service = _make_service(dao, queue)

        with pytest.raises(TaskNotFoundError):
            await service.get_for_user(task_id=999, user_id=10)


class TestDeleteForUser:
    async def test_delete_queued_task(self):
        dao = AsyncMock()
        dao.get_for_user.return_value = _make_task(status=RenderStatus.QUEUED)
        queue = MagicMock()
        queue.cancel = AsyncMock()
        service = _make_service(dao, queue)

        await service.delete_for_user(task_id=1, user_id=10)

        queue.cancel.assert_awaited_once_with(1)
        dao.delete.assert_awaited_once_with(1)
        queue.forget.assert_called_once_with(1)

    async def test_delete_not_found_raises(self):
        dao = AsyncMock()
        dao.get_for_user.return_value = None
        queue = MagicMock()
        service = _make_service(dao, queue)

        with pytest.raises(TaskNotFoundError):
            await service.delete_for_user(task_id=999, user_id=10)
