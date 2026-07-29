"""StoredFile 模型单元测试。"""

from datetime import UTC, datetime

import pytest

from app.models.stored_file import StorageUsage, StoredFile


class TestStoredFileModel:
    """StoredFile 领域模型测试。"""

    def test_model_fields(self) -> None:
        """模型字段存在且类型正确。"""
        file = StoredFile(
            name="test.png",
            size_bytes=1024,
            modified_at=datetime(2026, 1, 1, tzinfo=UTC),
        )
        assert file.name == "test.png"
        assert file.size_bytes == 1024
        assert isinstance(file.modified_at, datetime)

    def test_model_is_frozen(self) -> None:
        """模型不可变（frozen=True）。"""
        file = StoredFile(
            name="test.png",
            size_bytes=1024,
            modified_at=datetime(2026, 1, 1, tzinfo=UTC),
        )
        with pytest.raises(Exception):
            file.name = "other.png"

    def test_size_bytes_field(self) -> None:
        """size_bytes 字段正确。"""
        file = StoredFile(
            name="large.mp4",
            size_bytes=10_000_000,
            modified_at=datetime(2026, 1, 1, tzinfo=UTC),
        )
        assert file.size_bytes == 10_000_000


class TestStorageUsageModel:
    """StorageUsage 领域模型测试。"""

    def test_model_fields(self) -> None:
        """模型字段存在且类型正确。"""
        usage = StorageUsage(
            used_bytes=500_000,
            limit_bytes=1_000_000,
        )
        assert usage.used_bytes == 500_000
        assert usage.limit_bytes == 1_000_000

    def test_model_is_frozen(self) -> None:
        """模型不可变（frozen=True）。"""
        usage = StorageUsage(
            used_bytes=500_000,
            limit_bytes=1_000_000,
        )
        with pytest.raises(Exception):
            usage.used_bytes = 600_000

    def test_available_bytes_computed(self) -> None:
        """available_bytes 计算属性正确。"""
        usage = StorageUsage(
            used_bytes=500_000,
            limit_bytes=1_000_000,
        )
        assert usage.available_bytes == 500_000

    def test_available_bytes_when_exceeded(self) -> None:
        """超过限额时 available_bytes 为 0。"""
        usage = StorageUsage(
            used_bytes=1_500_000,
            limit_bytes=1_000_000,
        )
        assert usage.available_bytes == 0

    def test_available_bytes_at_limit(self) -> None:
        """正好达到限额时 available_bytes 为 0。"""
        usage = StorageUsage(
            used_bytes=1_000_000,
            limit_bytes=1_000_000,
        )
        assert usage.available_bytes == 0

    def test_available_bytes_when_zero_used(self) -> None:
        """未使用时 available_bytes 等于限额。"""
        usage = StorageUsage(
            used_bytes=0,
            limit_bytes=1_000_000,
        )
        assert usage.available_bytes == 1_000_000