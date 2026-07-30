"""User 模型单元测试。"""

from datetime import UTC, datetime

import pytest
from pydantic import SecretStr

from app.models.user import OAuthAccount, User, UserCredentials


class TestUserModel:
    """User 领域模型测试。"""

    def test_model_fields(self) -> None:
        """模型字段存在且类型正确。"""
        user = User(
            id=1,
            username="alice",
            email="alice@example.com",
            is_verified=True,
            display_name="Alice",
            created_at=datetime(2026, 1, 1, tzinfo=UTC),
        )
        assert user.id == 1
        assert user.username == "alice"
        assert user.email == "alice@example.com"
        assert user.is_verified is True
        assert user.display_name == "Alice"
        assert isinstance(user.created_at, datetime)

    def test_username_optional(self) -> None:
        """username 为可选（OAuth 用户可能无用户名）。"""
        user = User(
            id=1,
            username=None,
            email="alice@example.com",
            is_verified=True,
            created_at=datetime(2026, 1, 1, tzinfo=UTC),
        )
        assert user.username is None

    def test_model_is_frozen(self) -> None:
        """模型不可变（frozen=True）。"""
        user = User(
            id=1,
            username="alice",
            email="alice@example.com",
            created_at=datetime(2026, 1, 1, tzinfo=UTC),
        )
        with pytest.raises(Exception):
            user.username = "bob"

    def test_username_min_length(self) -> None:
        """username 最小长度为 3（如果有值）。"""
        with pytest.raises(Exception):  # pydantic ValidationError
            User(
                id=1,
                username="ab",  # 少于 3 字符
                email="test@example.com",
                created_at=datetime(2026, 1, 1, tzinfo=UTC),
            )

    def test_username_max_length(self) -> None:
        """username 最大长度为 64（如果有值）。"""
        with pytest.raises(Exception):  # pydantic ValidationError
            User(
                id=1,
                username="a" * 65,  # 超过 64 字符
                email="test@example.com",
                created_at=datetime(2026, 1, 1, tzinfo=UTC),
            )

    def test_username_valid_length(self) -> None:
        """username 有效长度范围。"""
        # 3 字符
        user = User(
            id=1,
            username="abc",
            email="test@example.com",
            created_at=datetime(2026, 1, 1, tzinfo=UTC),
        )
        assert user.username == "abc"
        # 64 字符
        user = User(
            id=2,
            username="a" * 64,
            email="test@example.com",
            created_at=datetime(2026, 1, 1, tzinfo=UTC),
        )
        assert len(user.username) == 64

    def test_email_is_required(self) -> None:
        """email 为必填。"""
        user = User(
            id=1,
            username="alice",
            email="alice@example.com",
            created_at=datetime(2026, 1, 1, tzinfo=UTC),
        )
        assert user.email is not None

    def test_email_format_validation(self) -> None:
        """email 格式校验。"""
        # 有效 email
        user = User(
            id=1,
            username="alice",
            email="alice@example.com",
            created_at=datetime(2026, 1, 1, tzinfo=UTC),
        )
        assert user.email == "alice@example.com"
        # 无效 email
        with pytest.raises(Exception):  # pydantic ValidationError
            User(
                id=1,
                username="alice",
                email="invalid-email",
                created_at=datetime(2026, 1, 1, tzinfo=UTC),
            )

    def test_is_verified_defaults_to_false(self) -> None:
        """is_verified 默认为 False。"""
        user = User(
            id=1,
            username="alice",
            email="alice@example.com",
            created_at=datetime(2026, 1, 1, tzinfo=UTC),
        )
        assert user.is_verified is False

    def test_account_permissions_have_safe_defaults(self) -> None:
        """新用户默认启用且不是管理员，避免意外提权或不可登录。"""
        user = User(
            id=1,
            username="alice",
            email="alice@example.com",
            created_at=datetime(2026, 1, 1, tzinfo=UTC),
        )

        assert user.is_active is True
        assert user.is_admin is False
        assert user.last_login_at is None


class TestUserCredentialsModel:
    """UserCredentials 领域模型测试。"""

    def test_model_fields(self) -> None:
        """模型字段存在且类型正确。"""
        creds = UserCredentials(
            user_id=1,
            username="alice",
            password_hash_secret_string=SecretStr("hashed_password"),
        )
        assert creds.user_id == 1
        assert creds.username == "alice"
        assert isinstance(creds.password_hash_secret_string, SecretStr)

    def test_username_optional(self) -> None:
        """username 为可选（OAuth 用户可能无用户名）。"""
        creds = UserCredentials(
            user_id=1,
            username=None,
            password_hash_secret_string=SecretStr("hashed_password"),
        )
        assert creds.username is None

    def test_password_hash_optional(self) -> None:
        """password_hash 为可选（OAuth 用户可能无密码）。"""
        creds = UserCredentials(
            user_id=1,
            username="alice",
            password_hash_secret_string=None,
        )
        assert creds.password_hash_secret_string is None

    def test_model_is_frozen(self) -> None:
        """模型不可变（frozen=True）。"""
        creds = UserCredentials(
            user_id=1,
            username="alice",
            password_hash_secret_string=SecretStr("hashed_password"),
        )
        with pytest.raises(Exception):
            creds.username = "bob"

    def test_password_hash_is_secret(self) -> None:
        """密码哈希为 SecretStr 类型。"""
        creds = UserCredentials(
            user_id=1,
            username="alice",
            password_hash_secret_string=SecretStr("hashed_password"),
        )
        # 需显式调用 get_secret_value() 才能获取明文
        assert creds.password_hash_secret_string.get_secret_value() == "hashed_password"


class TestOAuthAccountModel:
    """OAuthAccount 领域模型测试。"""

    def test_model_fields(self) -> None:
        """模型字段存在且类型正确。"""
        oauth = OAuthAccount(
            id=1,
            user_id=1,
            provider="google",
            provider_user_id="12345",
            provider_email="alice@gmail.com",
            provider_display_name="Alice",
            created_at=datetime(2026, 1, 1, tzinfo=UTC),
        )
        assert oauth.id == 1
        assert oauth.user_id == 1
        assert oauth.provider == "google"
        assert oauth.provider_user_id == "12345"
        assert oauth.provider_email == "alice@gmail.com"
        assert oauth.provider_display_name == "Alice"

    def test_provider_email_optional(self) -> None:
        """provider_email 为可选。"""
        oauth = OAuthAccount(
            id=1,
            user_id=1,
            provider="github",
            provider_user_id="12345",
            created_at=datetime(2026, 1, 1, tzinfo=UTC),
        )
        assert oauth.provider_email is None

    def test_model_is_frozen(self) -> None:
        """模型不可变（frozen=True）。"""
        oauth = OAuthAccount(
            id=1,
            user_id=1,
            provider="google",
            provider_user_id="12345",
            created_at=datetime(2026, 1, 1, tzinfo=UTC),
        )
        with pytest.raises(Exception):
            oauth.provider = "github"
