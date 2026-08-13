"""auth_router 单元测试：reset-password / send-code 接口契约（TestClient + 全 mock，无进程外 I/O）。

SessionDep 用 mock 覆盖，AuthService.reset_password 被 patch，断言异常→HTTP 映射。
send-code 覆盖 reset_password 未注册邮箱的静默校验（不生码、不发信）。
"""

from collections.abc import AsyncIterator
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.api.deps import get_session
from app.core.exceptions import UserNotFoundError, VerificationCodeInvalidError
from app.main import app
from app.models.user import User


def _user() -> User:
    from datetime import UTC, datetime

    return User(
        id=1,
        username=None,
        email="alice@example.com",
        is_verified=True,
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
    )


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> AsyncIterator[TestClient]:
    """TestClient，session 覆盖为 mock（unit 阶段不触达真实 DB）。"""
    from app.core.config import settings
    from app.service.queue_service import render_queue

    # 关闭队列自动启动：lifespan 否则会用真实 session 查 render_tasks 表
    monkeypatch.setattr(settings, "render_queue_autostart", False)
    render_queue.reset()

    async def _override_session() -> AsyncIterator[MagicMock]:
        yield AsyncMock()

    app.dependency_overrides[get_session] = _override_session
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


class TestResetPasswordEndpoint:
    """POST /auth/reset-password 接口契约。"""

    def test_reset_password_returns_token(self, client: TestClient):
        """验证码正确 → 201 + token。"""
        mock_service = MagicMock()
        mock_service.reset_password = AsyncMock(return_value=_user())

        with pytest.MonkeyPatch.context() as mp:
            mp.setattr("app.api.v1.auth_router.AuthService", lambda _s: mock_service)
            resp = client.post(
                "/api/v1/auth/reset-password",
                json={
                    "email": "alice@example.com",
                    "code": "123456",
                    "new_password": "newpass123",
                },
            )

        assert resp.status_code == 201
        body = resp.json()
        assert body["token_type"] == "bearer"
        assert body["access_token"]
        assert body["refresh_token"]
        mock_service.reset_password.assert_awaited_once()

    def test_reset_password_invalid_code_400(self, client: TestClient):
        """验证码错误 → 400。"""
        mock_service = MagicMock()
        mock_service.reset_password = AsyncMock(
            side_effect=VerificationCodeInvalidError("验证码错误")
        )

        with pytest.MonkeyPatch.context() as mp:
            mp.setattr("app.api.v1.auth_router.AuthService", lambda _s: mock_service)
            resp = client.post(
                "/api/v1/auth/reset-password",
                json={
                    "email": "alice@example.com",
                    "code": "000000",
                    "new_password": "newpass123",
                },
            )

        assert resp.status_code == 400
        assert resp.json()["code"] == "verification_code_invalid"

    def test_reset_password_user_not_found_404(self, client: TestClient):
        """邮箱未注册 → 404。"""
        mock_service = MagicMock()
        mock_service.reset_password = AsyncMock(
            side_effect=UserNotFoundError("用户不存在")
        )

        with pytest.MonkeyPatch.context() as mp:
            mp.setattr("app.api.v1.auth_router.AuthService", lambda _s: mock_service)
            resp = client.post(
                "/api/v1/auth/reset-password",
                json={
                    "email": "ghost@example.com",
                    "code": "123456",
                    "new_password": "newpass123",
                },
            )

        assert resp.status_code == 404
        assert resp.json()["code"] == "user_not_found"


def _post_send_code(
    client: TestClient, *, email: str, purpose: str
) -> object:
    return client.post(
        "/api/v1/auth/send-code",
        json={"email": email, "purpose": purpose},
    )


class TestSendCodeEndpoint:
    """POST /auth/send-code：reset_password 静默校验。"""

    def test_reset_password_unknown_email_skips_generate_and_send(
        self, client: TestClient
    ) -> None:
        """未注册邮箱：200 已发送，但不生码、不发信。"""
        mock_user = MagicMock()
        mock_user.exists_by_email = AsyncMock(return_value=False)
        mock_verification_cls = MagicMock()
        mock_email_cls = MagicMock()

        with (
            patch("app.api.v1.auth_router.UserService", return_value=mock_user),
            patch(
                "app.api.v1.auth_router.VerificationService",
                mock_verification_cls,
            ),
            patch("app.api.v1.auth_router.EmailService", mock_email_cls),
        ):
            resp = _post_send_code(
                client, email="ghost@example.com", purpose="reset_password"
            )

        assert resp.status_code == 200
        assert resp.json() == {"message": "验证码已发送"}
        mock_user.exists_by_email.assert_awaited_once_with("ghost@example.com")
        mock_verification_cls.assert_not_called()
        mock_email_cls.assert_not_called()

    def test_reset_password_registered_generates_code(
        self, client: TestClient
    ) -> None:
        """已注册邮箱：仍生码。"""
        mock_user = MagicMock()
        mock_user.exists_by_email = AsyncMock(return_value=True)
        mock_verification = MagicMock()
        mock_verification.generate_code = AsyncMock(return_value="123456")
        mock_email = MagicMock()
        mock_email.send_verification_code = AsyncMock()

        with (
            patch("app.api.v1.auth_router.UserService", return_value=mock_user),
            patch(
                "app.api.v1.auth_router.VerificationService",
                return_value=mock_verification,
            ),
            patch("app.api.v1.auth_router.EmailService", return_value=mock_email),
        ):
            resp = _post_send_code(
                client, email="alice@example.com", purpose="reset_password"
            )

        assert resp.status_code == 200
        assert resp.json() == {"message": "验证码已发送"}
        mock_user.exists_by_email.assert_awaited_once_with("alice@example.com")
        mock_verification.generate_code.assert_awaited_once_with(
            "alice@example.com", "reset_password"
        )

    def test_register_purpose_still_generates_code(
        self, client: TestClient
    ) -> None:
        """register purpose 不走存在性守卫，任意邮箱都生码。"""
        mock_user_cls = MagicMock()
        mock_verification = MagicMock()
        mock_verification.generate_code = AsyncMock(return_value="123456")
        mock_email = MagicMock()
        mock_email.send_verification_code = AsyncMock()

        with (
            patch("app.api.v1.auth_router.UserService", mock_user_cls),
            patch(
                "app.api.v1.auth_router.VerificationService",
                return_value=mock_verification,
            ),
            patch("app.api.v1.auth_router.EmailService", return_value=mock_email),
        ):
            resp = _post_send_code(
                client, email="new@example.com", purpose="register"
            )

        assert resp.status_code == 200
        assert resp.json() == {"message": "验证码已发送"}
        mock_user_cls.assert_not_called()
        mock_verification.generate_code.assert_awaited_once_with(
            "new@example.com", "register"
        )
