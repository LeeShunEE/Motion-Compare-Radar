"""管理员渲染接口的真实 router-service-DAO 链路测试。"""

from collections.abc import Callable

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings


def test_submit_cancel_retry_and_history_round_trip(
    client: TestClient,
    register_user: Callable[..., dict],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "initial_admin_email", "alice@example.com")
    tokens = register_user("alice@example.com")
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}
    submitted = client.post(
        "/api/v1/render",
        headers=headers,
        json={"mode": "single", "codec": "h264", "input_props": {"chart": "radar"}},
    ).json()

    active = client.get("/api/v1/admin/render/active", headers=headers)
    assert active.status_code == 200
    assert active.json()["items"][0]["id"] == submitted["id"]

    canceled = client.post(
        f"/api/v1/admin/render/{submitted['id']}/cancel", headers=headers
    )
    assert canceled.status_code == 200
    assert canceled.json()["status"] == "canceled"

    retried = client.post(
        f"/api/v1/admin/render/{submitted['id']}/retry", headers=headers
    )
    assert retried.status_code == 200
    assert retried.json()["retry_of_task_id"] == submitted["id"]

    history = client.get(
        "/api/v1/admin/render/history?status=queued", headers=headers
    )
    assert history.status_code == 200
    assert history.json()["total"] == 1
