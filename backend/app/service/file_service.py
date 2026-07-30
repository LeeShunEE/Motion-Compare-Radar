"""用户文件存储服务。

行级多租户：每个用户一个目录 ``<storage_root>/users/<uid>/``，其中
``uploads/`` 存放上传素材、``outputs/`` 存放渲染产物。

配额控制：
- 大小配额：单用户上传文件总大小限制（max_user_storage_bytes，默认 200MB）
- 数量配额：单用户上传文件数量限制（max_upload_count，默认 500 个）

文件系统是文件的唯一事实来源。
"""

from datetime import UTC, datetime
from pathlib import Path

from app.core.exceptions import (
    InvalidFileError,
    QuotaExceededError,
    StoredFileNotFoundError,
)
from app.models.stored_file import StorageUsage, StoredFile
from app.utils.sizing import directory_size


def _validate_filename(filename: str) -> str:
    """校验上传文件名，阻止路径穿越与空名。"""
    name = filename.strip()
    if not name or name in {".", ".."}:
        raise InvalidFileError("文件名不能为空")
    if name != Path(name).name or "/" in name or "\\" in name:
        raise InvalidFileError(f"非法文件名: {filename}")
    return name


class FileService:
    """用户上传文件的存取与配额控制。"""

    def __init__(
        self, storage_root: Path, max_user_bytes: int, max_upload_count: int = 500
    ) -> None:
        self._storage_root = storage_root
        self._max_user_bytes = max_user_bytes
        self._max_upload_count = max_upload_count

    def _user_dir(self, user_id: int) -> Path:
        return self._storage_root / "users" / str(user_id)

    def _uploads_dir(self, user_id: int) -> Path:
        path = self._user_dir(user_id) / "uploads"
        path.mkdir(parents=True, exist_ok=True)
        return path

    def outputs_dir(self, user_id: int) -> Path:
        """渲染产物目录（不计入用户配额，由全局 GC 管理）。"""
        path = self._user_dir(user_id) / "outputs"
        path.mkdir(parents=True, exist_ok=True)
        return path

    def _count_uploads(self, user_id: int) -> int:
        """统计用户上传文件数量。"""
        uploads = self._uploads_dir(user_id)
        return sum(1 for f in uploads.iterdir() if f.is_file())

    def usage(self, user_id: int) -> StorageUsage:
        """返回用户的存储用量与配额（仅统计 uploads 目录）。"""
        uploads = self._uploads_dir(user_id)
        used = directory_size(uploads)
        count = self._count_uploads(user_id)
        return StorageUsage(
            used_bytes=used,
            limit_bytes=self._max_user_bytes,
            upload_count=count,
            upload_limit=self._max_upload_count,
        )

    def output_usage_bytes(self, user_id: int) -> int:
        """返回用户渲染产物目录的当前占用字节数。"""
        return directory_size(self.outputs_dir(user_id))

    def list_uploads(self, user_id: int) -> list[StoredFile]:
        """列出用户上传目录下的文件（按名称排序）。"""
        uploads = self._uploads_dir(user_id)
        files = [
            StoredFile(
                name=f.name,
                size_bytes=f.stat().st_size,
                modified_at=datetime.fromtimestamp(f.stat().st_mtime, tz=UTC),
            )
            for f in uploads.iterdir()
            if f.is_file()
        ]
        return sorted(files, key=lambda f: f.name)

    def upload_exists(self, user_id: int, filename: str) -> bool:
        """返回经过安全文件名校验的上传文件是否存在。"""
        name = _validate_filename(filename)
        return (self._uploads_dir(user_id) / name).is_file()

    def save_upload(self, user_id: int, filename: str, data: bytes) -> StoredFile:
        """保存上传文件；超配额时抛 ``QuotaExceededError``。

        配额检查包括：
        1. 大小配额：uploads 目录总大小不超过 max_user_bytes
        2. 数量配额：uploads 目录文件数量不超过 max_upload_count
        """
        name = _validate_filename(filename)
        uploads = self._uploads_dir(user_id)
        used = directory_size(uploads)
        target = uploads / name

        # 覆盖同名文件时，先扣掉旧文件占用再核算配额
        existing_size = target.stat().st_size if target.exists() else 0
        new_used = used - existing_size + len(data)

        # 大小配额检查
        if new_used > self._max_user_bytes:
            raise QuotaExceededError("超出存储配额，请先删除部分文件")

        # 数量配额检查（新增文件时）
        if not target.exists():
            current_count = self._count_uploads(user_id)
            if current_count >= self._max_upload_count:
                raise QuotaExceededError(
                    f"超出文件数量限制（最多 {self._max_upload_count} 个），请先删除部分文件"
                )

        target.write_bytes(data)
        stat = target.stat()
        return StoredFile(
            name=name,
            size_bytes=stat.st_size,
            modified_at=datetime.fromtimestamp(stat.st_mtime, tz=UTC),
        )

    def delete_upload(self, user_id: int, filename: str) -> None:
        """删除用户上传文件；不存在时抛 ``StoredFileNotFoundError``。"""
        name = _validate_filename(filename)
        target = self._uploads_dir(user_id) / name
        if not target.is_file():
            raise StoredFileNotFoundError(f"文件不存在: {name}")
        target.unlink()

    def get_upload_path(self, user_id: int, filename: str) -> Path:
        """返回用户上传文件的绝对路径；不存在时抛 ``StoredFileNotFoundError``。"""
        name = _validate_filename(filename)
        target = self._uploads_dir(user_id) / name
        if not target.is_file():
            raise StoredFileNotFoundError(f"文件不存在: {name}")
        return target

    def get_output_path(self, user_id: int, output_path: str) -> Path:
        """校验渲染产物路径归属并返回绝对路径；不存在时抛 ``StoredFileNotFoundError``。"""
        target = Path(output_path)
        if not target.is_file():
            raise StoredFileNotFoundError(f"渲染产物不存在: {output_path}")
        # 安全校验：产物必须在用户 outputs 目录下
        expected_parent = self._user_dir(user_id) / "outputs"
        try:
            target.resolve().relative_to(expected_parent.resolve())
        except ValueError:
            raise StoredFileNotFoundError("渲染产物不属于当前用户")  # noqa: B904
        return target
