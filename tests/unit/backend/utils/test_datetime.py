"""datetime 工具单元测试：ensure_utc 归一化。"""

from datetime import UTC, datetime, timedelta, timezone

from app.utils.datetime import ensure_utc


class TestEnsureUtc:
    def test_naive_gets_utc_tzinfo(self):
        naive = datetime(2026, 6, 18, 12, 0, 0)  # noqa: DTZ001 测试刻意构造 naive 输入
        result = ensure_utc(naive)
        assert result.tzinfo is UTC
        assert result == datetime(2026, 6, 18, 12, 0, 0, tzinfo=UTC)

    def test_aware_utc_unchanged(self):
        aware = datetime(2026, 6, 18, 12, 0, 0, tzinfo=UTC)
        assert ensure_utc(aware) == aware

    def test_aware_other_zone_converted_to_utc(self):
        # UTC+8 的 20:00 == UTC 的 12:00
        plus8 = datetime(2026, 6, 18, 20, 0, 0, tzinfo=timezone(timedelta(hours=8)))
        result = ensure_utc(plus8)
        assert result.tzinfo == UTC
        assert result == datetime(2026, 6, 18, 12, 0, 0, tzinfo=UTC)

    def test_naive_comparable_with_now(self):
        # 回归：归一后可与 datetime.now(tz=UTC) 比较而不抛 TypeError
        past_naive = datetime.now(tz=UTC).replace(tzinfo=None) - timedelta(hours=1)
        assert ensure_utc(past_naive) < datetime.now(tz=UTC)
