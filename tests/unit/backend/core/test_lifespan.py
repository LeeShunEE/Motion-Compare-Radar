"""应用生命周期启动准备测试。"""

from pathlib import Path

import pytest

from app.core.config import settings
from app.core.lifespan import _prepare_public_asset_mountpoints


def test_prepare_public_asset_mountpoints(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    public_assets = tmp_path / "public"
    monkeypatch.setattr(settings, "public_assets_path", public_assets)

    _prepare_public_asset_mountpoints()

    assert (public_assets / "_render_tmp").is_dir()
    assert (public_assets / "_user_media").is_dir()
