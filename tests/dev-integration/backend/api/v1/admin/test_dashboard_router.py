"""Dashboard 真实数据库聚合链路。"""

from collections.abc import Callable
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings


def test_dashboard_reflects_registered_user_and_render(
    client: TestClient,
    register_user: Callable[..., dict],
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setattr(settings, "initial_admin_email", "alice@example.com")
    monkeypatch.setattr(settings, "public_assets_path", tmp_path / "public")
    tokens = register_user("alice@example.com")
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}
    client.post(
        "/api/v1/render",
        headers=headers,
        json={"mode": "single", "codec": "h264", "input_props": {"chart": "radar"}},
    )

    response = client.get("/api/v1/admin/dashboard?range=24h", headers=headers)

    assert response.status_code == 200
    assert response.json()["users"]["total"] == 1
    assert response.json()["users"]["active"] == 1
    assert response.json()["renders"]["submitted"] == 1
    assert response.json()["queue"]["pending"] == 1
