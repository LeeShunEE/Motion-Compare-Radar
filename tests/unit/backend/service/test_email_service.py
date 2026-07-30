"""email_service 单元测试（mock resend SDK，覆盖发码/欢迎/失败分支）。

不发起真实 HTTP：resend.Emails.send_async 被替换为内存 mock（§4 进程内允许）。
"""

from unittest.mock import AsyncMock

import pytest
import resend
from pydantic import SecretStr

from app.core.config import settings
from app.core.exceptions import EmailServiceError
from app.service.email_service import EmailService


@pytest.fixture
def mock_send(monkeypatch: pytest.MonkeyPatch) -> AsyncMock:
    """替换 resend.Emails.send_async 为内存 mock（生产路径必须走 async，避免堵事件循环）。"""
    send = AsyncMock()
    monkeypatch.setattr(resend.Emails, "send_async", send)
    return send


@pytest.fixture
def with_api_key(monkeypatch: pytest.MonkeyPatch) -> str:
    """注入伪造的 Resend key 与发件人，返回发件人地址供断言。"""
    monkeypatch.setattr(
        settings, "resend_api_key_secret_string", SecretStr("fake-key")
    )
    from_email = "noreply@test.example.com"
    monkeypatch.setattr(settings, "resend_from_email", from_email)
    return from_email


class TestInit:
    def test_missing_key_raises(self, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.setattr(settings, "resend_api_key_secret_string", None)
        with pytest.raises(EmailServiceError):
            EmailService()

    def test_sets_api_key(self, with_api_key, monkeypatch):
        monkeypatch.setattr(resend, "api_key", None)
        EmailService()
        assert resend.api_key == "fake-key"


class TestSendVerificationCode:
    async def test_send_register(self, with_api_key, mock_send):
        await EmailService().send_verification_code("a@b.com", "123456", "register")
        mock_send.assert_awaited_once()
        payload = mock_send.call_args.args[0]
        assert payload["to"] == "a@b.com"
        assert payload["subject"] == "Radar-Renderer 邮箱验证码"
        assert "123456" in payload["text"]
        assert payload["from"] == with_api_key

    async def test_send_uses_overridden_from_email(
        self, with_api_key, mock_send, monkeypatch
    ):
        """env 覆盖 resend_from_email 时，payload 使用覆盖后的发件人。"""
        overridden = "noreply@xn--30q18ry71c.com"
        monkeypatch.setattr(settings, "resend_from_email", overridden)
        await EmailService().send_verification_code("a@b.com", "123456", "register")
        payload = mock_send.call_args.args[0]
        assert payload["from"] == overridden

    async def test_send_reset_password(self, with_api_key, mock_send):
        await EmailService().send_verification_code(
            "a@b.com", "654321", "reset_password"
        )
        payload = mock_send.call_args.args[0]
        assert payload["subject"] == "Radar-Renderer 重置密码验证码"
        assert "654321" in payload["text"]

    async def test_unknown_purpose_raises(self, with_api_key, mock_send):
        with pytest.raises(EmailServiceError):
            await EmailService().send_verification_code("a@b.com", "1", "weird")
        mock_send.assert_not_awaited()

    async def test_send_failure_raises(self, with_api_key, mock_send):
        mock_send.side_effect = RuntimeError("network down")
        with pytest.raises(EmailServiceError):
            await EmailService().send_verification_code("a@b.com", "1", "register")

    async def test_uses_send_async_not_sync_send(
        self, with_api_key, mock_send, monkeypatch
    ):
        """回归：禁止再走同步 Emails.send，否则会堵死单 worker 事件循环。"""
        from unittest.mock import MagicMock

        blocked = MagicMock(
            side_effect=AssertionError("sync Emails.send must not be used")
        )
        monkeypatch.setattr(resend.Emails, "send", blocked)
        await EmailService().send_verification_code("a@b.com", "123456", "register")
        mock_send.assert_awaited_once()
        blocked.assert_not_called()


class TestSendOauthWelcome:
    async def test_send_welcome(self, with_api_key, mock_send):
        await EmailService().send_oauth_welcome("a@b.com", "google")
        mock_send.assert_awaited_once()
        payload = mock_send.call_args.args[0]
        assert "google" in payload["subject"]
        assert payload["from"] == with_api_key

    async def test_send_welcome_failure_swallows(self, with_api_key, mock_send):
        """欢迎邮件失败仅记日志，不抛（不影响登录流程）。"""
        mock_send.side_effect = RuntimeError("boom")
        # 不应抛出
        await EmailService().send_oauth_welcome("a@b.com", "google")
