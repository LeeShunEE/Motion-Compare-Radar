"""管理员公共资源接口契约测试。"""

from collections.abc import Iterator
from datetime import UTC, datetime
from importlib import import_module
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from app.api.deps import get_current_admin
from app.core.config import settings
from app.main import app
from app.models.user import User
from app.service.queue_service import render_queue

assets_router_module = import_module("app.api.v1.admin.assets_router")


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    admin = User(
        id=1,
        username="operator",
        email="operator@example.com",
        is_admin=True,
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
    )
    monkeypatch.setattr(settings, "public_assets_path", tmp_path)
    monkeypatch.setattr(settings, "max_public_asset_bytes", 8)
    monkeypatch.setattr(settings, "render_queue_autostart", False)
    render_queue.reset()
    audit = MagicMock()
    audit.record = AsyncMock()
    monkeypatch.setattr(assets_router_module, "AuditService", lambda _session: audit)
    app.dependency_overrides[get_current_admin] = lambda: admin
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def test_upload_list_overwrite_and_delete(client: TestClient) -> None:
    created = client.post(
        "/api/v1/admin/assets/music",
        files={"file": ("intro.mp3", b"old", "audio/mpeg")},
    )
    assert created.status_code == 201
    assert created.json()["name"] == "intro.mp3"

    conflict = client.post(
        "/api/v1/admin/assets/music",
        files={"file": ("intro.mp3", b"new", "audio/mpeg")},
    )
    assert conflict.status_code == 409
    assert conflict.json()["code"] == "asset_conflict"

    replaced = client.post(
        "/api/v1/admin/assets/music?overwrite=true",
        files={"file": ("intro.mp3", b"new", "audio/mpeg")},
    )
    assert replaced.status_code == 201

    listed = client.get("/api/v1/admin/assets?category=music")
    assert listed.status_code == 200
    assert [asset["name"] for asset in listed.json()] == ["intro.mp3"]

    deleted = client.delete("/api/v1/admin/assets/music/intro.mp3")
    assert deleted.status_code == 204
    assert client.get("/api/v1/admin/assets?category=music").json() == []


def test_upload_rejects_invalid_category_and_large_file(client: TestClient) -> None:
    unknown = client.post(
        "/api/v1/admin/assets/fonts",
        files={"file": ("font.ttf", b"font", "font/ttf")},
    )
    assert unknown.status_code == 422

    oversized = client.post(
        "/api/v1/admin/assets/music",
        files={"file": ("large.mp3", b"123456789", "audio/mpeg")},
    )
    assert oversized.status_code == 400
    assert oversized.json()["code"] == "invalid_file"
