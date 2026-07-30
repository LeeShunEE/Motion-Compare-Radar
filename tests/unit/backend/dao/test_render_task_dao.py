"""RenderTaskDAO 单元测试。"""

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.dao.orm import RenderTaskORM
from app.dao.render_task_dao import RenderTaskDAO, _to_domain
from app.models.render_task import Codec, RenderMode, RenderStatus, RenderTask


@pytest.fixture
def mock_session() -> AsyncMock:
    """Mock AsyncSession。"""
    return AsyncMock()


@pytest.fixture
def dao(mock_session: AsyncMock) -> RenderTaskDAO:
    """DAO 实例。"""
    return RenderTaskDAO(mock_session)


class TestToDomain:
    """_to_domain 转换测试。"""

    def test_converts_orm_to_domain(self) -> None:
        """ORM 正确转换为领域模型。"""
        orm = MagicMock(spec=RenderTaskORM)
        orm.id = 1
        orm.user_id = 1
        orm.mode = "single"
        orm.codec = "h264"
        orm.status = "queued"
        orm.input_props = {"key": "value"}
        orm.output_path = "/output/video.mp4"
        orm.error = None
        orm.duration_ms = None
        orm.created_at = datetime(2026, 1, 1, tzinfo=UTC)
        orm.started_at = None
        orm.finished_at = None

        domain = _to_domain(orm)
        assert domain.id == 1
        assert domain.user_id == 1
        assert domain.mode == RenderMode.SINGLE
        assert domain.codec == Codec.H264
        assert domain.status == RenderStatus.QUEUED
        assert domain.input_props == {"key": "value"}
        assert domain.output_path == "/output/video.mp4"

    def test_converts_orm_with_all_fields(self) -> None:
        """ORM 所有字段正确转换。"""
        orm = MagicMock(spec=RenderTaskORM)
        orm.id = 2
        orm.user_id = 1
        orm.mode = "multi"
        orm.codec = "gif"
        orm.status = "done"
        orm.input_props = {}
        orm.output_path = "/output/video.gif"
        orm.error = None
        orm.duration_ms = 5000
        orm.created_at = datetime(2026, 1, 1, tzinfo=UTC)
        orm.started_at = datetime(2026, 1, 2, tzinfo=UTC)
        orm.finished_at = datetime(2026, 1, 3, tzinfo=UTC)

        domain = _to_domain(orm)
        assert domain.id == 2
        assert domain.mode == RenderMode.MULTI
        assert domain.codec == Codec.GIF
        assert domain.status == RenderStatus.DONE
        assert domain.duration_ms == 5000
        assert domain.started_at is not None
        assert domain.finished_at is not None

    def test_converts_failed_task(self) -> None:
        """失败任务 ORM 正确转换。"""
        orm = MagicMock(spec=RenderTaskORM)
        orm.id = 3
        orm.user_id = 1
        orm.mode = "single"
        orm.codec = "h264"
        orm.status = "failed"
        orm.input_props = {}
        orm.output_path = ""
        orm.error = "Something went wrong"
        orm.duration_ms = None
        orm.created_at = datetime(2026, 1, 1, tzinfo=UTC)
        orm.started_at = datetime(2026, 1, 2, tzinfo=UTC)
        orm.finished_at = datetime(2026, 1, 3, tzinfo=UTC)

        domain = _to_domain(orm)
        assert domain.status == RenderStatus.FAILED
        assert domain.error == "Something went wrong"


class TestCreate:
    """create 方法测试。"""

    async def test_create_returns_task(
        self, mock_session: AsyncMock
    ) -> None:
        """create 返回 RenderTask。"""
        # 创建一个预期的领域模型
        expected_task = RenderTask(
            id=1,
            user_id=1,
            mode=RenderMode.SINGLE,
            codec=Codec.H264,
            status=RenderStatus.QUEUED,
            input_props={"config": "data"},
            output_path="/output/video.mp4",
            created_at=datetime(2026, 1, 1, tzinfo=UTC),
        )

        # Mock session 操作
        mock_session.add = MagicMock()
        mock_session.commit = AsyncMock()
        mock_session.refresh = AsyncMock()

        # Patch _to_domain 以返回预期的领域模型
        import app.dao.render_task_dao as dao_module
        with pytest.MonkeyPatch.context() as m:
            m.setattr(dao_module, "_to_domain", lambda _: expected_task)
            dao = RenderTaskDAO(mock_session)
            task = await dao.create(
                user_id=1,
                mode=RenderMode.SINGLE,
                codec=Codec.H264,
                input_props={"config": "data"},
                output_path="/output/video.mp4",
            )

        # 验证 session 操作
        mock_session.add.assert_called_once()
        mock_session.commit.assert_called_once()
        mock_session.refresh.assert_called_once()

        # 验证返回值
        assert task.id == 1
        assert task.user_id == 1
        assert task.mode == RenderMode.SINGLE
        assert task.codec == Codec.H264
        assert task.status == RenderStatus.QUEUED


class TestGet:
    """get 方法测试。"""

    async def test_get_returns_task_when_found(
        self, dao: RenderTaskDAO, mock_session: AsyncMock
    ) -> None:
        """get 返回 RenderTask 当任务存在。"""
        orm = MagicMock()
        orm.id = 1
        orm.user_id = 1
        orm.mode = "single"
        orm.codec = "h264"
        orm.status = "done"
        orm.input_props = {}
        orm.output_path = "/output/video.mp4"
        orm.error = None
        orm.duration_ms = 1000
        orm.created_at = datetime(2026, 1, 1, tzinfo=UTC)
        orm.started_at = datetime(2026, 1, 2, tzinfo=UTC)
        orm.finished_at = datetime(2026, 1, 3, tzinfo=UTC)

        mock_session.get = AsyncMock(return_value=orm)

        task = await dao.get(1)
        assert task is not None
        assert task.id == 1
        assert task.status == RenderStatus.DONE

    async def test_get_returns_none_when_not_found(
        self, dao: RenderTaskDAO, mock_session: AsyncMock
    ) -> None:
        """get 返回 None 当任务不存在。"""
        mock_session.get = AsyncMock(return_value=None)

        task = await dao.get(999)
        assert task is None


class TestConditionalTerminalTransitions:
    async def test_mark_running_if_queued_filters_current_status(
        self, dao: RenderTaskDAO, mock_session: AsyncMock
    ) -> None:
        result = MagicMock()
        result.rowcount = 0
        mock_session.execute = AsyncMock(return_value=result)

        updated = await dao.mark_running_if_queued(7)

        statement = mock_session.execute.await_args.args[0]
        assert "render_tasks.status" in str(statement)
        assert updated is False

    async def test_mark_done_if_running_filters_current_status(
        self, dao: RenderTaskDAO, mock_session: AsyncMock
    ) -> None:
        result = MagicMock()
        result.rowcount = 0
        mock_session.execute = AsyncMock(return_value=result)

        updated = await dao.mark_done_if_running(7, "/output/7.mp4", 1200)

        statement = mock_session.execute.await_args.args[0]
        sql = str(statement)
        assert "render_tasks.status" in sql
        assert updated is False
        mock_session.commit.assert_awaited_once()

    async def test_mark_failed_if_running_reports_update(
        self, dao: RenderTaskDAO, mock_session: AsyncMock
    ) -> None:
        result = MagicMock()
        result.rowcount = 1
        mock_session.execute = AsyncMock(return_value=result)

        updated = await dao.mark_failed_if_running(7, "worker timeout")

        assert updated is True


class TestGetForUser:
    """get_for_user 方法测试。"""

    async def test_get_for_user_returns_task_when_found(
        self, dao: RenderTaskDAO, mock_session: AsyncMock
    ) -> None:
        """get_for_user 返回任务当用户拥有该任务。"""
        orm = MagicMock()
        orm.id = 1
        orm.user_id = 1
        orm.mode = "single"
        orm.codec = "h264"
        orm.status = "queued"
        orm.input_props = {}
        orm.output_path = ""
        orm.error = None
        orm.duration_ms = None
        orm.created_at = datetime(2026, 1, 1, tzinfo=UTC)
        orm.started_at = None
        orm.finished_at = None

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = orm
        mock_session.execute = AsyncMock(return_value=mock_result)

        task = await dao.get_for_user(1, 1)
        assert task is not None
        assert task.id == 1
        assert task.user_id == 1

    async def test_get_for_user_returns_none_when_not_owned(
        self, dao: RenderTaskDAO, mock_session: AsyncMock
    ) -> None:
        """get_for_user 返回 None 当用户不拥有该任务。"""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_session.execute = AsyncMock(return_value=mock_result)

        task = await dao.get_for_user(1, 999)
        assert task is None


class TestListForUser:
    """list_for_user 方法测试。"""

    async def test_list_for_user_returns_tasks(
        self, dao: RenderTaskDAO, mock_session: AsyncMock
    ) -> None:
        """list_for_user 返回用户的任务列表。"""
        orm1 = MagicMock()
        orm1.id = 1
        orm1.user_id = 1
        orm1.mode = "single"
        orm1.codec = "h264"
        orm1.status = "done"
        orm1.input_props = {}
        orm1.output_path = "/output/1.mp4"
        orm1.error = None
        orm1.duration_ms = 100
        orm1.created_at = datetime(2026, 1, 1, tzinfo=UTC)
        orm1.started_at = None
        orm1.finished_at = None

        orm2 = MagicMock()
        orm2.id = 2
        orm2.user_id = 1
        orm2.mode = "single"
        orm2.codec = "gif"
        orm2.status = "queued"
        orm2.input_props = {}
        orm2.output_path = ""
        orm2.error = None
        orm2.duration_ms = None
        orm2.created_at = datetime(2026, 1, 2, tzinfo=UTC)
        orm2.started_at = None
        orm2.finished_at = None

        mock_result = MagicMock()
        mock_scalars = MagicMock()
        mock_scalars.all.return_value = [orm1, orm2]
        mock_result.scalars.return_value = mock_scalars
        mock_session.execute = AsyncMock(return_value=mock_result)

        tasks = await dao.list_for_user(1)
        assert len(tasks) == 2
        assert tasks[0].id == 1
        assert tasks[1].id == 2

    async def test_list_for_user_returns_empty_when_none(
        self, dao: RenderTaskDAO, mock_session: AsyncMock
    ) -> None:
        """list_for_user 返回空列表当用户无任务。"""
        mock_result = MagicMock()
        mock_scalars = MagicMock()
        mock_scalars.all.return_value = []
        mock_result.scalars.return_value = mock_scalars
        mock_session.execute = AsyncMock(return_value=mock_result)

        tasks = await dao.list_for_user(999)
        assert tasks == []


class TestListQueuedIds:
    """list_queued_ids 方法测试。"""

    async def test_list_queued_ids_returns_ids(
        self, dao: RenderTaskDAO, mock_session: AsyncMock
    ) -> None:
        """list_queued_ids 返回排队任务 ID 列表。"""
        mock_result = MagicMock()
        mock_scalars = MagicMock()
        mock_scalars.all.return_value = [1, 2, 3]
        mock_result.scalars.return_value = mock_scalars
        mock_session.execute = AsyncMock(return_value=mock_result)

        ids = await dao.list_queued_ids()
        assert ids == [1, 2, 3]

    async def test_list_queued_ids_returns_empty_when_none(
        self, dao: RenderTaskDAO, mock_session: AsyncMock
    ) -> None:
        """list_queued_ids 返回空列表当无排队任务。"""
        mock_result = MagicMock()
        mock_scalars = MagicMock()
        mock_scalars.all.return_value = []
        mock_result.scalars.return_value = mock_scalars
        mock_session.execute = AsyncMock(return_value=mock_result)

        ids = await dao.list_queued_ids()
        assert ids == []


class TestDelete:
    """delete 方法测试。"""

    async def test_delete_existing_task(
        self, dao: RenderTaskDAO, mock_session: AsyncMock
    ) -> None:
        """delete 删除存在的任务。"""
        orm = MagicMock()
        mock_session.get = AsyncMock(return_value=orm)
        mock_session.delete = AsyncMock()
        mock_session.commit = AsyncMock()

        await dao.delete(1)

        mock_session.get.assert_called_once()
        mock_session.delete.assert_called_once_with(orm)
        mock_session.commit.assert_called_once()

    async def test_delete_non_existing_task_skips(
        self, dao: RenderTaskDAO, mock_session: AsyncMock
    ) -> None:
        """delete 跳过不存在的任务。"""
        mock_session.get = AsyncMock(return_value=None)
        mock_session.delete = AsyncMock()
        mock_session.commit = AsyncMock()

        await dao.delete(999)

        mock_session.get.assert_called_once()
        mock_session.delete.assert_not_called()
        mock_session.commit.assert_not_called()


class TestListDoneForUser:
    """list_done_for_user 方法测试。"""

    async def test_list_done_for_user_returns_done_tasks(
        self, dao: RenderTaskDAO, mock_session: AsyncMock
    ) -> None:
        """list_done_for_user 返回用户所有 done 任务，按 finished_at 升序。"""
        orm1 = MagicMock()
        orm1.id = 1
        orm1.user_id = 1
        orm1.mode = "single"
        orm1.codec = "h264"
        orm1.status = "done"
        orm1.input_props = {}
        orm1.output_path = "/output/1.mp4"
        orm1.error = None
        orm1.duration_ms = 100
        orm1.created_at = datetime(2026, 1, 1, tzinfo=UTC)
        orm1.started_at = datetime(2026, 1, 2, tzinfo=UTC)
        orm1.finished_at = datetime(2026, 1, 3, tzinfo=UTC)

        orm2 = MagicMock()
        orm2.id = 2
        orm2.user_id = 1
        orm2.mode = "single"
        orm2.codec = "h264"
        orm2.status = "done"
        orm2.input_props = {}
        orm2.output_path = "/output/2.mp4"
        orm2.error = None
        orm2.duration_ms = 200
        orm2.created_at = datetime(2026, 1, 1, tzinfo=UTC)
        orm2.started_at = datetime(2026, 1, 2, tzinfo=UTC)
        orm2.finished_at = datetime(2026, 1, 4, tzinfo=UTC)

        mock_result = MagicMock()
        mock_scalars = MagicMock()
        mock_scalars.all.return_value = [orm1, orm2]  # 按 finished_at 升序
        mock_result.scalars.return_value = mock_scalars
        mock_session.execute = AsyncMock(return_value=mock_result)

        tasks = await dao.list_done_for_user(1)
        assert len(tasks) == 2
        assert tasks[0].id == 1  # finished_at 更早
        assert tasks[1].id == 2
        assert all(t.status == RenderStatus.DONE for t in tasks)

    async def test_list_done_for_user_returns_empty_when_none(
        self, dao: RenderTaskDAO, mock_session: AsyncMock
    ) -> None:
        """list_done_for_user 返回空列表当用户无 done 任务。"""
        mock_result = MagicMock()
        mock_scalars = MagicMock()
        mock_scalars.all.return_value = []
        mock_result.scalars.return_value = mock_scalars
        mock_session.execute = AsyncMock(return_value=mock_result)

        tasks = await dao.list_done_for_user(999)
        assert tasks == []


class TestListExpiredForUser:
    """list_expired_for_user 方法测试。"""

    async def test_list_expired_for_user_returns_expired_tasks(
        self, dao: RenderTaskDAO, mock_session: AsyncMock
    ) -> None:
        """list_expired_for_user 返回超过保留天数的 done 任务。"""
        # 创建一个过期任务（finished_at + max_age_days < now）
        now = datetime(2026, 6, 25, tzinfo=UTC)
        max_age_days = 7
        cutoff = now - timedelta(days=max_age_days)

        orm1 = MagicMock()
        orm1.id = 1
        orm1.user_id = 1
        orm1.mode = "single"
        orm1.codec = "h264"
        orm1.status = "done"
        orm1.input_props = {}
        orm1.output_path = "/output/1.mp4"
        orm1.error = None
        orm1.duration_ms = 100
        orm1.created_at = datetime(2026, 1, 1, tzinfo=UTC)
        orm1.started_at = datetime(2026, 1, 2, tzinfo=UTC)
        orm1.finished_at = cutoff - timedelta(days=1)  # 早于 cutoff，已过期

        mock_result = MagicMock()
        mock_scalars = MagicMock()
        mock_scalars.all.return_value = [orm1]
        mock_result.scalars.return_value = mock_scalars
        mock_session.execute = AsyncMock(return_value=mock_result)

        tasks = await dao.list_expired_for_user(1, max_age_days)
        assert len(tasks) == 1
        assert tasks[0].id == 1
        assert tasks[0].status == RenderStatus.DONE

    async def test_list_expired_for_user_returns_empty_when_none_expired(
        self, dao: RenderTaskDAO, mock_session: AsyncMock
    ) -> None:
        """list_expired_for_user 返回空列表当无过期任务。"""
        mock_result = MagicMock()
        mock_scalars = MagicMock()
        mock_scalars.all.return_value = []
        mock_result.scalars.return_value = mock_scalars
        mock_session.execute = AsyncMock(return_value=mock_result)

        tasks = await dao.list_expired_for_user(1, 7)
        assert tasks == []
