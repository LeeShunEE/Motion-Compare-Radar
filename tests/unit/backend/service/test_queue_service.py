"""service/queue_service.py 单元测试。

队列内存态逻辑（入队/取消/排位/ETA）不依赖 DB 或网络，
直接构造 RenderQueue 实例验证。
"""

import asyncio
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, patch

import pytest

from app.service.queue_service import RenderQueue


def _make_queue(concurrency: int = 2) -> RenderQueue:
    worker = AsyncMock()
    session_factory = AsyncMock()
    return RenderQueue(
        concurrency=concurrency,
        worker=worker,
        session_factory=session_factory,
    )


class TestEnqueueAndCancel:
    def test_enqueue_increases_pending(self):
        q = _make_queue()
        q.enqueue(10)
        assert 10 in q._pending
        assert q.queue_size() == 1

    def test_cancel_removes_from_pending(self):
        q = _make_queue()
        q.enqueue(10)
        q.cancel(10)
        assert 10 not in q._pending
        assert 10 in q._canceled

    def test_forget_removes_everywhere(self):
        q = _make_queue()
        q.enqueue(10)
        q._running[20] = 0.0
        q.forget(10)
        q.forget(20)
        assert 10 not in q._pending
        assert 20 not in q._running
        assert q.queue_size() == 0

    def test_reset_clears_all(self):
        q = _make_queue()
        q.enqueue(1)
        q.enqueue(2)
        q._running[3] = 0.0
        q._canceled.add(4)
        q.reset()
        assert q.queue_size() == 0
        assert len(q._canceled) == 0


class TestPosition:
    def test_position_in_pending(self):
        q = _make_queue()
        q.enqueue(10)
        q.enqueue(20)
        q.enqueue(30)
        assert q.position(10) == 1
        assert q.position(20) == 2
        assert q.position(30) == 3

    def test_position_running_returns_zero(self):
        q = _make_queue()
        q._running[10] = 0.0
        assert q.position(10) == 0

    def test_position_unknown_returns_zero(self):
        q = _make_queue()
        assert q.position(999) == 0


class TestAdminSnapshot:
    def test_snapshot_contains_running_progress_pending_position_and_capacity(self):
        q = _make_queue(concurrency=2)
        q._running[10] = __import__("time").monotonic()
        q._progress[10] = (24, 100)
        q.enqueue(20)
        q.record_render_speed(60, 1000)

        snapshot = q.admin_snapshot()

        assert snapshot.concurrency == 2
        assert snapshot.queue_size == 2
        assert snapshot.avg_fps == 60
        assert snapshot.tasks[0].rendered_frames == 24
        assert snapshot.tasks[1].position == 1


class TestEta:
    def test_eta_for_running_task(self):
        q = _make_queue()
        # 无历史样本时使用默认 60s
        q._running[10] = 0.0  # monotonic 起始设为极早 → elapsed 很大
        # 因为 elapsed > avg(60s)，结果应被 clamp 到 0
        import time
        q._running[10] = time.monotonic() - 100
        eta = q.eta_seconds(10)
        assert eta is not None
        assert eta >= 0.0

    def test_eta_for_pending_task(self):
        q = _make_queue()
        q.enqueue(10)
        eta = q.eta_seconds(10)
        assert eta is not None
        assert eta > 0

    def test_eta_for_unknown_returns_none(self):
        q = _make_queue()
        assert q.eta_seconds(999) is None


class TestAverageDuration:
    def test_default_when_no_samples(self):
        q = _make_queue()
        assert q.average_duration() == 60.0

    def test_with_samples(self):
        q = _make_queue()
        q._durations.extend([10.0, 20.0, 30.0])
        assert q.average_duration() == 20.0


class TestFpsStats:
    def test_record_render_speed_appends_sample(self):
        q = _make_queue()
        q.record_render_speed(180, 3000)  # 180 frames / 3s = 60 fps
        assert list(q._fps_samples) == [60.0]

    def test_record_render_speed_ignores_zero_frames(self):
        q = _make_queue()
        q.record_render_speed(0, 3000)
        assert len(q._fps_samples) == 0

    def test_record_render_speed_ignores_zero_duration(self):
        q = _make_queue()
        q.record_render_speed(180, 0)
        assert len(q._fps_samples) == 0

    def test_average_fps_returns_none_when_empty(self):
        q = _make_queue()
        assert q.average_fps() is None

    def test_average_fps_with_samples(self):
        q = _make_queue()
        q._fps_samples.extend([30.0, 60.0, 90.0])
        assert q.average_fps() == 60.0

    def test_fps_samples_maxlen_20_rolling(self):
        q = _make_queue()
        # 填入 25 个样本
        for i in range(25):
            q.record_render_speed(60, 1000)  # 60 fps each
        assert len(q._fps_samples) == 20
        # 最新 20 个保留，平均值仍为 60
        assert q.average_fps() == 60.0

    def test_reset_clears_fps_samples(self):
        q = _make_queue()
        q._fps_samples.extend([30.0, 60.0])
        q.reset()
        assert q.average_fps() is None


class TestProgress:
    def test_update_progress_only_for_running(self):
        q = _make_queue()
        q._running[10] = 0.0
        q.update_progress(10, 30, 120)
        assert q.progress(10) == (30, 120)

    def test_update_progress_ignored_when_not_running(self):
        q = _make_queue()
        # 迟到/越权上报：任务不在 running，应被忽略
        q.update_progress(99, 30, 120)
        assert q.progress(99) is None

    def test_progress_unknown_returns_none(self):
        q = _make_queue()
        assert q.progress(999) is None

    def test_forget_clears_progress(self):
        q = _make_queue()
        q._running[10] = 0.0
        q.update_progress(10, 30, 120)
        q.forget(10)
        assert q.progress(10) is None

    def test_reset_clears_progress(self):
        q = _make_queue()
        q._running[10] = 0.0
        q.update_progress(10, 30, 120)
        q.reset()
        assert q.progress(10) is None

    async def test_process_one_clears_progress_in_finally(self):
        """渲染结束后 _process_one 的 finally 必须清理 running + progress。"""
        q = _make_queue()

        @asynccontextmanager
        async def _factory():
            yield AsyncMock()

        q._session_factory = _factory
        dao = AsyncMock()
        dao.get.return_value = None  # 提前返回，验证 finally 仍跑清理
        # 预置一条进度（模拟回调已写入），_process_one 的 finally 应清掉
        q._progress[10] = (5, 10)
        with patch("app.service.queue_service.RenderTaskDAO", return_value=dao):
            await q._process_one(10)

        assert 10 not in q._running
        assert q.progress(10) is None
