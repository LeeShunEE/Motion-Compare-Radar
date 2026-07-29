"""公共资源领域模型测试。"""

from datetime import UTC, datetime

import pytest

from app.models.public_asset import AssetCategory, PublicAsset


def test_public_asset_is_frozen_and_carries_category() -> None:
    asset = PublicAsset(
        category=AssetCategory.MUSIC,
        name="intro.flac",
        size_bytes=16,
        modified_at=datetime(2026, 1, 1, tzinfo=UTC),
    )

    assert asset.path == "music/intro.flac"
    with pytest.raises(Exception):
        asset.name = "changed.flac"
