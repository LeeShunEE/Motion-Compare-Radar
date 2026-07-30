"""RenderTask 模型单元测试。"""

from datetime import UTC, datetime

import pytest

from app.models.render_task import Codec, RenderMode, RenderStatus, RenderTask


class TestRenderModeEnum:
    """RenderMode 枚举测试。"""

    def test_single_value(self) -> None:
        """RenderMode.SINGLE 值为 'single'。"""
        assert RenderMode.SINGLE.value == "single"

    def test_multi_value(self) -> None:
        """RenderMode.MULTI 值为 'multi'。"""
        assert RenderMode.MULTI.value == "multi"

    def test_from_string(self) -> None:
        """从字符串构建枚举。"""
        assert RenderMode("single") == RenderMode.SINGLE
        assert RenderMode("multi") == RenderMode.MULTI

    def test_invalid_value_raises(self) -> None:
        """无效 mode 抛 ValueError。"""
        with pytest.raises(ValueError):
            RenderMode("invalid")


class TestRenderStatusEnum:
    """RenderStatus 枚举测试。"""

    def test_queued_value(self) -> None:
        """QUEUED 值为 'queued'。"""
        assert RenderStatus.QUEUED.value == "queued"

    def test_running_value(self) -> None:
        """RUNNING 值为 'running'。"""
        assert RenderStatus.RUNNING.value == "running"

    def test_done_value(self) -> None:
        """DONE 值为 'done'。"""
        assert RenderStatus.DONE.value == "done"

    def test_failed_value(self) -> None:
        """FAILED 值为 'failed'。"""
        assert RenderStatus.FAILED.value == "failed"

    def test_canceled_value(self) -> None:
        """CANCELED 值为 'canceled'。"""
        assert RenderStatus.CANCELED.value == "canceled"

    def test_from_string(self) -> None:
        """从字符串构建枚举。"""
        assert RenderStatus("queued") == RenderStatus.QUEUED
        assert RenderStatus("running") == RenderStatus.RUNNING

    def test_invalid_value_raises(self) -> None:
        """无效 status 抛 ValueError。"""
        with pytest.raises(ValueError):
            RenderStatus("invalid")


class TestCodecEnum:
    """Codec 枚举测试。"""

    def test_h264_value(self) -> None:
        """H264 值为 'h264'。"""
        assert Codec.H264.value == "h264"

    def test_gif_value(self) -> None:
        """GIF 值为 'gif'。"""
        assert Codec.GIF.value == "gif"

    def test_from_string(self) -> None:
        """从字符串构建枚举。"""
        assert Codec("h264") == Codec.H264
        assert Codec("gif") == Codec.GIF

    def test_invalid_value_raises(self) -> None:
        """无效 codec 抛 ValueError。"""
        with pytest.raises(ValueError):
            Codec("invalid")


class TestRenderTaskModel:
    """领域模型字段测试。"""

    def test_model_field_types(self) -> None:
        """模型字段类型正确。"""
        task = RenderTask(
            id=1,
            user_id=1,
            mode=RenderMode.SINGLE,
            codec=Codec.H264,
            status=RenderStatus.QUEUED,
            input_props={"key": "value"},
            output_path="/output/video.mp4",
            created_at=datetime(2026, 1, 1, tzinfo=UTC),
        )
        assert isinstance(task.id, int)
        assert isinstance(task.user_id, int)
        assert isinstance(task.mode, RenderMode)
        assert isinstance(task.codec, Codec)
        assert isinstance(task.status, RenderStatus)
        assert isinstance(task.input_props, dict)
        assert isinstance(task.output_path, str)

    def test_model_is_frozen(self) -> None:
        """模型不可变（frozen=True）。"""
        task = RenderTask(
            id=1,
            user_id=1,
            mode=RenderMode.SINGLE,
            codec=Codec.H264,
            status=RenderStatus.QUEUED,
            input_props={},
            output_path="",
            created_at=datetime(2026, 1, 1, tzinfo=UTC),
        )
        with pytest.raises(Exception):  # pydantic ValidationError 或 FrozenInstanceError
            task.status = RenderStatus.DONE

    def test_optional_fields(self) -> None:
        """可选字段可以 None。"""
        task = RenderTask(
            id=1,
            user_id=1,
            mode=RenderMode.SINGLE,
            codec=Codec.H264,
            status=RenderStatus.QUEUED,
            input_props={},
            output_path="",
            error=None,
            duration_ms=None,
            created_at=datetime(2026, 1, 1, tzinfo=UTC),
            started_at=None,
            finished_at=None,
        )
        assert task.error is None
        assert task.duration_ms is None
        assert task.started_at is None
        assert task.finished_at is None


class TestRenderTaskProperties:
    """模型属性测试。"""

    def test_is_active_when_queued(self) -> None:
        """QUEUED 状态时 is_active 为 True。"""
        task = RenderTask(
            id=1,
            user_id=1,
            mode=RenderMode.SINGLE,
            codec=Codec.H264,
            status=RenderStatus.QUEUED,
            input_props={},
            output_path="",
            created_at=datetime(2026, 1, 1, tzinfo=UTC),
        )
        assert task.is_active is True

    def test_is_active_when_running(self) -> None:
        """RUNNING 状态时 is_active 为 True。"""
        task = RenderTask(
            id=1,
            user_id=1,
            mode=RenderMode.SINGLE,
            codec=Codec.H264,
            status=RenderStatus.RUNNING,
            input_props={},
            output_path="",
            created_at=datetime(2026, 1, 1, tzinfo=UTC),
        )
        assert task.is_active is True

    def test_is_active_when_done(self) -> None:
        """DONE 状态时 is_active 为 False。"""
        task = RenderTask(
            id=1,
            user_id=1,
            mode=RenderMode.SINGLE,
            codec=Codec.H264,
            status=RenderStatus.DONE,
            input_props={},
            output_path="",
            created_at=datetime(2026, 1, 1, tzinfo=UTC),
        )
        assert task.is_active is False

    def test_is_active_when_failed(self) -> None:
        """FAILED 状态时 is_active 为 False。"""
        task = RenderTask(
            id=1,
            user_id=1,
            mode=RenderMode.SINGLE,
            codec=Codec.H264,
            status=RenderStatus.FAILED,
            input_props={},
            output_path="",
            created_at=datetime(2026, 1, 1, tzinfo=UTC),
        )
        assert task.is_active is False

    def test_has_output_when_done(self) -> None:
        """DONE 状态时 has_output 为 True。"""
        task = RenderTask(
            id=1,
            user_id=1,
            mode=RenderMode.SINGLE,
            codec=Codec.H264,
            status=RenderStatus.DONE,
            input_props={},
            output_path="/output/video.mp4",
            created_at=datetime(2026, 1, 1, tzinfo=UTC),
        )
        assert task.has_output is True

    def test_has_output_when_not_done(self) -> None:
        """非 DONE 状态时 has_output 为 False。"""
        task = RenderTask(
            id=1,
            user_id=1,
            mode=RenderMode.SINGLE,
            codec=Codec.H264,
            status=RenderStatus.QUEUED,
            input_props={},
            output_path="",
            created_at=datetime(2026, 1, 1, tzinfo=UTC),
        )
        assert task.has_output is False