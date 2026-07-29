"""公共资源文件服务单元测试。"""

from pathlib import Path

import pytest

from app.core.exceptions import InvalidFileError, PublicAssetConflictError, StoredFileNotFoundError
from app.models.public_asset import AssetCategory
from app.service.admin.public_asset_service import PublicAssetService


@pytest.fixture
def service(tmp_path: Path) -> PublicAssetService:
    return PublicAssetService(tmp_path, max_file_bytes=8)


def test_list_creates_missing_category_and_sorts(service: PublicAssetService) -> None:
    service.save(AssetCategory.MUSIC, "z.mp3", b"z")
    service.save(AssetCategory.MUSIC, "a.flac", b"aa")

    assert [asset.name for asset in service.list(AssetCategory.MUSIC)] == [
        "a.flac",
        "z.mp3",
    ]


@pytest.mark.parametrize(
    ("category", "name"),
    [
        (AssetCategory.SILHOUETTES, "shape.txt"),
        (AssetCategory.MUSIC, "track.exe"),
        (AssetCategory.MUSIC, "../track.mp3"),
        (AssetCategory.MUSIC, "bad\nname.mp3"),
    ],
)
def test_save_rejects_invalid_names_and_extensions(
    service: PublicAssetService, category: AssetCategory, name: str
) -> None:
    with pytest.raises(InvalidFileError):
        service.save(category, name, b"data")


def test_save_rejects_oversized_content(service: PublicAssetService) -> None:
    with pytest.raises(InvalidFileError):
        service.save(AssetCategory.MUSIC, "large.mp3", b"123456789")


def test_existing_file_requires_explicit_overwrite(service: PublicAssetService) -> None:
    service.save(AssetCategory.MUSIC, "intro.mp3", b"old")

    with pytest.raises(PublicAssetConflictError):
        service.save(AssetCategory.MUSIC, "intro.mp3", b"new")

    replaced = service.save(
        AssetCategory.MUSIC, "intro.mp3", b"new", overwrite=True
    )
    assert replaced.size_bytes == 3
    assert service.path(AssetCategory.MUSIC, "intro.mp3").read_bytes() == b"new"


def test_delete_removes_file_and_missing_is_404(service: PublicAssetService) -> None:
    service.save(AssetCategory.SILHOUETTES, "hero.svg", b"<svg/>")
    service.delete(AssetCategory.SILHOUETTES, "hero.svg")

    with pytest.raises(StoredFileNotFoundError):
        service.delete(AssetCategory.SILHOUETTES, "hero.svg")
