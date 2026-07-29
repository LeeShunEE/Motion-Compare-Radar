"""公共资源文件的安全存取服务。"""

from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from app.core.exceptions import (
    InvalidFileError,
    PublicAssetConflictError,
    StoredFileNotFoundError,
)
from app.models.public_asset import AssetCategory, PublicAsset

_ALLOWED_EXTENSIONS: dict[AssetCategory, frozenset[str]] = {
    AssetCategory.SILHOUETTES: frozenset(
        {".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"}
    ),
    AssetCategory.MUSIC: frozenset(
        {".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac"}
    ),
}


def validate_asset_name(category: AssetCategory, filename: str) -> str:
    """校验 basename、控制字符和分类允许的扩展名。"""
    name = filename.strip()
    has_control_character = any(ord(character) < 32 for character in name)
    if (
        not name
        or name in {".", ".."}
        or name != Path(name).name
        or "/" in name
        or "\\" in name
        or has_control_character
    ):
        raise InvalidFileError("公共资源文件名无效")
    if Path(name).suffix.lower() not in _ALLOWED_EXTENSIONS[category]:
        raise InvalidFileError("文件类型不受该资源分类支持")
    return name


class PublicAssetService:
    """以文件系统为唯一事实来源管理公共资源。"""

    def __init__(self, root: Path, max_file_bytes: int) -> None:
        self._root = root
        self._max_file_bytes = max_file_bytes

    def _category_dir(self, category: AssetCategory) -> Path:
        directory = self._root / category.value
        directory.mkdir(parents=True, exist_ok=True)
        return directory

    def _to_domain(self, category: AssetCategory, path: Path) -> PublicAsset:
        stat = path.stat()
        return PublicAsset(
            category=category,
            name=path.name,
            size_bytes=stat.st_size,
            modified_at=datetime.fromtimestamp(stat.st_mtime, tz=UTC),
        )

    def list(self, category: AssetCategory) -> list[PublicAsset]:
        """列出分类内有效文件并按文件名排序。"""
        files = (
            self._to_domain(category, path)
            for path in self._category_dir(category).iterdir()
            if path.is_file()
            and path.suffix.lower() in _ALLOWED_EXTENSIONS[category]
            and not path.name.startswith(".")
        )
        return sorted(files, key=lambda asset: asset.name.casefold())

    def save(
        self,
        category: AssetCategory,
        filename: str,
        data: bytes,
        *,
        overwrite: bool = False,
    ) -> PublicAsset:
        """用同目录临时文件原子创建或替换公共资源。"""
        name = validate_asset_name(category, filename)
        if len(data) > self._max_file_bytes:
            raise InvalidFileError("公共资源文件超过大小限制")

        target = self._category_dir(category) / name
        if target.exists() and not overwrite:
            raise PublicAssetConflictError("同名公共资源已存在")

        temporary = target.with_name(f".{name}.{uuid4().hex}.tmp")
        try:
            temporary.write_bytes(data)
            temporary.replace(target)
        finally:
            if temporary.exists():
                temporary.unlink()
        return self._to_domain(category, target)

    def delete(self, category: AssetCategory, filename: str) -> None:
        """删除公共资源；不存在时返回稳定 404。"""
        self.path(category, filename).unlink()

    def path(self, category: AssetCategory, filename: str) -> Path:
        """返回已存在公共资源路径。"""
        name = validate_asset_name(category, filename)
        target = self._category_dir(category) / name
        if not target.is_file():
            raise StoredFileNotFoundError(f"公共资源不存在: {category.value}/{name}")
        return target
