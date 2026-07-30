"""oauth_service 单元测试：provider 配置探测、授权 URL、state 校验、创建/绑定用户。"""

from datetime import UTC, datetime
from unittest.mock import AsyncMock

import pytest

from app.core.config import settings
from app.core.exceptions import AccountDisabledError, OAuthError
from app.models.user import OAuthAccount, User
from app.service.oauth_service import OAuthService


class TestIsProviderConfigured:
    def test_google_configured_when_client_id_set(
        self, monkeypatch: pytest.MonkeyPatch
    ):
        monkeypatch.setattr(settings, "oauth_google_client_id", "g-id")
        assert OAuthService.is_provider_configured("google") is True

    def test_google_not_configured_when_client_id_missing(
        self, monkeypatch: pytest.MonkeyPatch
    ):
        monkeypatch.setattr(settings, "oauth_google_client_id", None)
        assert OAuthService.is_provider_configured("google") is False

    def test_github_reflects_client_id(self, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.setattr(settings, "oauth_github_client_id", "gh-id")
        assert OAuthService.is_provider_configured("github") is True

    def test_unknown_provider_is_false(self):
        assert OAuthService.is_provider_configured("wechat") is False


class TestGetAuthorizationUrl:
    def test_unsupported_provider_raises(self):
        with pytest.raises(OAuthError):
            OAuthService.get_authorization_url("wechat", "s")

    def test_google_unconfigured_raises(self, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.setattr(settings, "oauth_google_client_id", None)
        with pytest.raises(OAuthError):
            OAuthService.get_authorization_url("google", "s")

    def test_google_configured_embeds_state(
        self, monkeypatch: pytest.MonkeyPatch
    ):
        monkeypatch.setattr(settings, "oauth_google_client_id", "g-id")
        monkeypatch.setattr(settings, "oauth_google_redirect_uri", "http://x/cb")

        url = OAuthService.get_authorization_url("google", "xyz-state")
        assert url.startswith("https://accounts.google.com/o/oauth2/v2/auth")
        assert "client_id=g-id" in url
        assert "state=xyz-state" in url

    def test_github_unconfigured_raises(self, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.setattr(settings, "oauth_github_client_id", None)
        with pytest.raises(OAuthError):
            OAuthService.get_authorization_url("github", "s")

    def test_github_configured_embeds_state(self, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.setattr(settings, "oauth_github_client_id", "gh-id")
        monkeypatch.setattr(settings, "oauth_github_redirect_uri", "http://x/cb")

        url = OAuthService.get_authorization_url("github", "gh-state")
        assert url.startswith("https://github.com/login/oauth/authorize")
        assert "state=gh-state" in url


def _make_service(
    oauth_dao: AsyncMock, user_dao: AsyncMock, oauth_state_dao: AsyncMock
) -> OAuthService:
    service = OAuthService.__new__(OAuthService)
    service._oauth_dao = oauth_dao
    service._user_dao = user_dao
    service._oauth_state_dao = oauth_state_dao
    service._audit = AsyncMock()
    return service


def _user(
    uid: int = 1,
    username: str | None = "alice",
    *,
    is_active: bool = True,
) -> User:
    return User(
        id=uid,
        username=username,
        email="alice@example.com",
        is_verified=True,
        is_active=is_active,
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
    )


def _oauth_account(uid: int = 1) -> OAuthAccount:
    return OAuthAccount(
        id=1,
        user_id=uid,
        provider="google",
        provider_user_id="g-1",
        provider_email="alice@example.com",
        provider_display_name="Alice",
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
    )


class TestStartAuthorization:
    async def test_start_creates_state_and_returns_url(
        self, monkeypatch: pytest.MonkeyPatch
    ):
        oauth_state_dao = AsyncMock()
        service = _make_service(AsyncMock(), AsyncMock(), oauth_state_dao)
        monkeypatch.setattr(settings, "oauth_google_client_id", "g-id")
        monkeypatch.setattr(settings, "oauth_google_redirect_uri", "http://x/cb")

        url = await service.start_authorization("google")

        assert "state=" in url
        oauth_state_dao.create.assert_awaited_once()
        _, kwargs = oauth_state_dao.create.call_args
        assert kwargs["provider"] == "google"
        assert kwargs["state"]


class TestVerifyState:
    async def test_verify_passes_when_consumed(self):
        oauth_state_dao = AsyncMock()
        oauth_state_dao.consume.return_value = True
        service = _make_service(AsyncMock(), AsyncMock(), oauth_state_dao)

        await service._verify_state("google", "valid-state")
        oauth_state_dao.consume.assert_awaited_once()

    async def test_verify_raises_when_not_consumed(self):
        oauth_state_dao = AsyncMock()
        oauth_state_dao.consume.return_value = False
        service = _make_service(AsyncMock(), AsyncMock(), oauth_state_dao)

        with pytest.raises(OAuthError):
            await service._verify_state("google", "forged")


class TestCreateOrGetUser:
    async def test_existing_binding_returns_user(self):
        oauth_dao = AsyncMock()
        oauth_dao.get_by_provider_user_id.return_value = _oauth_account(1)
        user_dao = AsyncMock()
        user_dao.get_by_id.return_value = _user(1)
        user_dao.record_successful_login.return_value = _user(1)
        service = _make_service(oauth_dao, user_dao, AsyncMock())

        user, is_new = await service._create_or_get_user(
            "google", "g-1", "alice@example.com", "Alice"
        )
        assert is_new is False
        assert user.id == 1
        user_dao.record_successful_login.assert_awaited_once_with(
            1, initial_admin_email=None
        )
        oauth_dao.create.assert_not_called()

    async def test_existing_disabled_binding_is_rejected(self):
        oauth_dao = AsyncMock()
        oauth_dao.get_by_provider_user_id.return_value = _oauth_account(1)
        user_dao = AsyncMock()
        user_dao.get_by_id.return_value = _user(1, is_active=False)
        service = _make_service(oauth_dao, user_dao, AsyncMock())

        with pytest.raises(AccountDisabledError):
            await service._create_or_get_user(
                "google", "g-1", "alice@example.com", "Alice"
            )

        user_dao.record_successful_login.assert_not_awaited()

    async def test_existing_binding_missing_user_raises(self):
        oauth_dao = AsyncMock()
        oauth_dao.get_by_provider_user_id.return_value = _oauth_account(1)
        user_dao = AsyncMock()
        user_dao.get_by_id.return_value = None
        service = _make_service(oauth_dao, user_dao, AsyncMock())

        with pytest.raises(OAuthError):
            await service._create_or_get_user(
                "google", "g-1", "alice@example.com", "Alice"
            )

    async def test_email_registered_binds_and_returns(self):
        oauth_dao = AsyncMock()
        oauth_dao.get_by_provider_user_id.return_value = None
        user_dao = AsyncMock()
        user_dao.get_by_email.return_value = _user(1)
        service = _make_service(oauth_dao, user_dao, AsyncMock())

        user, is_new = await service._create_or_get_user(
            "google", "g-1", "alice@example.com", "Alice"
        )
        assert is_new is False
        oauth_dao.create.assert_awaited_once()

    async def test_new_user_auto_registered(self):
        oauth_dao = AsyncMock()
        oauth_dao.get_by_provider_user_id.return_value = None
        user_dao = AsyncMock()
        user_dao.get_by_email.return_value = None
        user_dao.create.return_value = _user(1, username=None)
        service = _make_service(oauth_dao, user_dao, AsyncMock())

        user, is_new = await service._create_or_get_user(
            "google", "g-1", "alice@example.com", "Alice"
        )
        assert is_new is True
        assert oauth_dao.create.await_count == 1
        # 落库用户无凭据（OAuth 自动注册）
        _, kwargs = user_dao.create.call_args
        assert kwargs["username"] is None
        assert kwargs["password_hash"] is None


class TestUnbindAndList:
    async def test_unbind_delegates_to_dao(self):
        oauth_dao = AsyncMock()
        oauth_dao.delete.return_value = True
        service = _make_service(oauth_dao, AsyncMock(), AsyncMock())

        assert await service.unbind_oauth_account(1, "google") is True
        oauth_dao.delete.assert_awaited_once_with(1, "google")

    async def test_list_returns_accounts(self):
        oauth_dao = AsyncMock()
        oauth_dao.list_by_user.return_value = [_oauth_account(1)]
        service = _make_service(oauth_dao, AsyncMock(), AsyncMock())

        accounts = await service.list_oauth_accounts(1)
        assert len(accounts) == 1
        oauth_dao.list_by_user.assert_awaited_once_with(1)

