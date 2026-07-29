"""service/auth_service.py 单元测试（DAO 全 mock）。"""

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.core.exceptions import AccountDisabledError, AuthError, UserExistsError
from app.core.security import hash_password
from app.models.user import User, UserCredentials
from app.service.auth_service import AuthService


def _make_service(dao: AsyncMock, verification_dao: AsyncMock = None) -> AuthService:
    service = AuthService.__new__(AuthService)
    service._dao = dao
    if verification_dao:
        service._verification_dao = verification_dao
    return service


def _user(*, is_active: bool = True, is_admin: bool = False) -> User:
    return User(
        id=1,
        username="alice",
        email="alice@example.com",
        is_verified=True,
        is_active=is_active,
        is_admin=is_admin,
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
    )


class TestRegisterWithPassword:
    async def test_register_with_password_creates_user(self):
        """register_with_password 创建用户。"""
        dao = AsyncMock()
        dao.exists.return_value = False
        dao.create.return_value = _user()
        service = _make_service(dao)

        user = await service.register_with_password(
            username="alice", email="alice@example.com", password="password123"
        )

        assert user.username == "alice"
        # 落库的是哈希，而非明文
        _, kwargs = dao.create.call_args
        assert kwargs["password_hash"] != "password123"

    async def test_register_with_password_conflict_raises(self):
        """register_with_password 用户已存在时抛异常。"""
        dao = AsyncMock()
        dao.exists.return_value = True
        service = _make_service(dao)

        with pytest.raises(UserExistsError):
            await service.register_with_password(
                username="alice", email="alice@example.com", password="password123"
            )
        dao.create.assert_not_called()


class TestVerifyAndRegister:
    async def test_verify_and_register_success(self):
        """verify_and_register 验证码正确后创建用户。"""
        from app.dao.orm import VerificationCodeORM

        # Mock verification DAO
        verification_dao = AsyncMock()
        mock_orm = MagicMock(spec=VerificationCodeORM)
        mock_orm.code = "123456"
        mock_orm.expires_at = datetime.now(tz=UTC) + timedelta(minutes=10)
        verification_dao.get_latest_unused.return_value = mock_orm
        verification_dao.mark_used = AsyncMock()

        # Mock user DAO
        dao = AsyncMock()
        dao.exists_by_email.return_value = False
        dao.create.return_value = User(
            id=1,
            username=None,
            email="alice@example.com",
            is_verified=True,
            created_at=datetime(2026, 1, 1, tzinfo=UTC),
        )
        dao.record_successful_login.return_value = User(
            id=1,
            username=None,
            email="alice@example.com",
            is_verified=True,
            is_admin=True,
            created_at=datetime(2026, 1, 1, tzinfo=UTC),
        )
        service = _make_service(dao, verification_dao)

        user = await service.verify_and_register(
            email="alice@example.com", code="123456"
        )

        assert user.email == "alice@example.com"
        assert user.username is None
        assert user.is_verified is True
        assert user.is_admin is True
        dao.record_successful_login.assert_awaited_once_with(
            1, initial_admin_email=None
        )

    async def test_verify_and_register_invalid_code_raises(self):
        """verify_and_register 验证码错误时抛异常。"""
        from app.core.exceptions import VerificationCodeInvalidError
        from app.dao.orm import VerificationCodeORM

        verification_dao = AsyncMock()
        mock_orm = MagicMock(spec=VerificationCodeORM)
        mock_orm.code = "123456"
        mock_orm.expires_at = datetime.now(tz=UTC) + timedelta(minutes=10)
        verification_dao.get_latest_unused.return_value = mock_orm

        dao = AsyncMock()
        service = _make_service(dao, verification_dao)

        with pytest.raises(VerificationCodeInvalidError):
            await service.verify_and_register(
                email="alice@example.com", code="wrong_code"
            )

    async def test_verify_and_register_email_exists_raises(self):
        """verify_and_register 邮箱已注册时抛异常。"""
        from app.dao.orm import VerificationCodeORM

        verification_dao = AsyncMock()
        mock_orm = MagicMock(spec=VerificationCodeORM)
        mock_orm.code = "123456"
        mock_orm.expires_at = datetime.now(tz=UTC) + timedelta(minutes=10)
        verification_dao.get_latest_unused.return_value = mock_orm
        verification_dao.mark_used = AsyncMock()

        dao = AsyncMock()
        dao.exists_by_email.return_value = True
        service = _make_service(dao, verification_dao)

        with pytest.raises(UserExistsError):
            await service.verify_and_register(
                email="alice@example.com", code="123456"
            )


class TestAuthenticate:
    async def test_authenticate_records_login_and_applies_admin_bootstrap(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """成功登录必须更新时间，并由 DAO 原子判定首位管理员。"""
        dao = AsyncMock()
        dao.get_credentials_by_username.return_value = UserCredentials(
            user_id=1,
            username="alice",
            password_hash_secret_string=hash_password("password123"),
        )
        dao.get_by_id.return_value = _user()
        dao.record_successful_login.return_value = _user(is_admin=True)
        from app.core.config import settings

        monkeypatch.setattr(
            settings, "initial_admin_email", "alice@example.com", raising=False
        )
        service = _make_service(dao)

        user = await service.authenticate(username="alice", password="password123")

        assert user.is_admin is True
        dao.record_successful_login.assert_awaited_once_with(
            1, initial_admin_email="alice@example.com"
        )

    async def test_authenticate_rejects_disabled_account(self) -> None:
        """停用账号不能换取新 token。"""
        dao = AsyncMock()
        dao.get_credentials_by_username.return_value = UserCredentials(
            user_id=1,
            username="alice",
            password_hash_secret_string=hash_password("password123"),
        )
        dao.get_by_id.return_value = _user(is_active=False)
        service = _make_service(dao)

        with pytest.raises(AccountDisabledError):
            await service.authenticate(username="alice", password="password123")

        dao.record_successful_login.assert_not_awaited()

    async def test_authenticate_by_username_success(self):
        """authenticate 用户名登录成功。"""
        dao = AsyncMock()
        dao.get_credentials_by_username.return_value = UserCredentials(
            user_id=1,
            username="alice",
            password_hash_secret_string=hash_password("password123"),
        )
        dao.get_by_id.return_value = _user()
        dao.record_successful_login.return_value = _user()
        service = _make_service(dao)

        user = await service.authenticate(username="alice", password="password123")
        assert user.id == 1

    async def test_authenticate_by_email_success(self):
        """authenticate 邮箱登录成功。"""
        dao = AsyncMock()
        dao.get_credentials_by_email.return_value = UserCredentials(
            user_id=1,
            username="alice",
            password_hash_secret_string=hash_password("password123"),
        )
        dao.get_by_id.return_value = _user()
        dao.record_successful_login.return_value = _user()
        service = _make_service(dao)

        user = await service.authenticate(email="alice@example.com", password="password123")
        assert user.id == 1

    async def test_authenticate_unknown_user_raises(self):
        """authenticate 用户不存在时抛异常。"""
        dao = AsyncMock()
        dao.get_credentials_by_username.return_value = None
        service = _make_service(dao)

        with pytest.raises(AuthError):
            await service.authenticate(username="ghost", password="x")

    async def test_authenticate_wrong_password_raises(self):
        """authenticate 密码错误时抛异常。"""
        dao = AsyncMock()
        dao.get_credentials_by_username.return_value = UserCredentials(
            user_id=1,
            username="alice",
            password_hash_secret_string=hash_password("correct"),
        )
        service = _make_service(dao)

        with pytest.raises(AuthError):
            await service.authenticate(username="alice", password="wrong")

    async def test_authenticate_no_password_raises(self):
        """authenticate 用户无密码时抛异常（OAuth 用户）。"""
        dao = AsyncMock()
        dao.get_credentials_by_username.return_value = UserCredentials(
            user_id=1,
            username="alice",
            password_hash_secret_string=None,
        )
        service = _make_service(dao)

        with pytest.raises(AuthError) as exc_info:
            await service.authenticate(username="alice", password="password123")
        assert "未设置密码" in str(exc_info.value.message)


class TestSetUsername:
    async def test_set_username_success(self):
        """set_username 成功设置用户名。"""
        dao = AsyncMock()
        dao.exists_by_username.return_value = False
        dao.set_username.return_value = User(
            id=1,
            username="alice",
            email="alice@example.com",
            is_verified=True,
            created_at=datetime(2026, 1, 1, tzinfo=UTC),
        )
        service = _make_service(dao)

        user = await service.set_username(1, "alice")
        assert user.username == "alice"

    async def test_set_username_conflict_raises(self):
        """set_username 用户名已存在时抛异常。"""
        dao = AsyncMock()
        dao.exists_by_username.return_value = True
        service = _make_service(dao)

        with pytest.raises(UserExistsError):
            await service.set_username(1, "alice")


class TestSetPassword:
    async def test_set_password_success(self):
        """set_password 成功设置密码。"""
        dao = AsyncMock()
        dao.set_password.return_value = _user()
        service = _make_service(dao)

        user = await service.set_password(1, "password123")
        assert user.id == 1


class TestResetPassword:
    """reset_password：验证码校验后设新密码。"""

    def _verification_dao(self, orm) -> AsyncMock:
        from app.dao.orm import VerificationCodeORM

        verification_dao = AsyncMock()
        if orm is None:
            verification_dao.get_latest_unused.return_value = None
        else:
            mock_orm = MagicMock(spec=VerificationCodeORM)
            mock_orm.code = orm["code"]
            mock_orm.expires_at = orm["expires_at"]
            verification_dao.get_latest_unused.return_value = mock_orm
        verification_dao.mark_used = AsyncMock()
        return verification_dao

    async def test_reset_password_success(self):
        """reset_password 验证码正确后设新密码。"""
        verification_dao = self._verification_dao(
            {"code": "123456", "expires_at": datetime.now(tz=UTC) + timedelta(minutes=10)}
        )
        dao = AsyncMock()
        dao.get_by_email.return_value = _user()
        dao.set_password.return_value = _user()
        service = _make_service(dao, verification_dao)

        user = await service.reset_password(
            email="alice@example.com", code="123456", new_password="newpass123"
        )

        assert user.id == 1
        verification_dao.mark_used.assert_called_once()
        # 落库的是哈希
        args, _ = dao.set_password.call_args
        assert args[1] != "newpass123"

    async def test_reset_password_invalid_code_raises(self):
        """reset_password 验证码不存在/已使用时抛异常。"""
        from app.core.exceptions import VerificationCodeInvalidError

        verification_dao = self._verification_dao(None)
        dao = AsyncMock()
        service = _make_service(dao, verification_dao)

        with pytest.raises(VerificationCodeInvalidError):
            await service.reset_password(
                email="alice@example.com", code="123456", new_password="newpass123"
            )
        dao.set_password.assert_not_called()

    async def test_reset_password_wrong_code_raises(self):
        """reset_password 验证码错误时抛异常。"""
        from app.core.exceptions import VerificationCodeInvalidError

        verification_dao = self._verification_dao(
            {"code": "123456", "expires_at": datetime.now(tz=UTC) + timedelta(minutes=10)}
        )
        dao = AsyncMock()
        service = _make_service(dao, verification_dao)

        with pytest.raises(VerificationCodeInvalidError):
            await service.reset_password(
                email="alice@example.com", code="999999", new_password="newpass123"
            )

    async def test_reset_password_expired_code_raises(self):
        """reset_password 验证码过期时抛异常。"""
        from app.core.exceptions import VerificationCodeExpiredError

        verification_dao = self._verification_dao(
            {"code": "123456", "expires_at": datetime.now(tz=UTC) - timedelta(minutes=1)}
        )
        dao = AsyncMock()
        service = _make_service(dao, verification_dao)

        with pytest.raises(VerificationCodeExpiredError):
            await service.reset_password(
                email="alice@example.com", code="123456", new_password="newpass123"
            )

    async def test_reset_password_user_not_found_raises(self):
        """reset_password 邮箱未注册时抛 UserNotFoundError。"""
        from app.core.exceptions import UserNotFoundError

        verification_dao = self._verification_dao(
            {"code": "123456", "expires_at": datetime.now(tz=UTC) + timedelta(minutes=10)}
        )
        dao = AsyncMock()
        dao.get_by_email.return_value = None
        service = _make_service(dao, verification_dao)

        with pytest.raises(UserNotFoundError):
            await service.reset_password(
                email="ghost@example.com", code="123456", new_password="newpass123"
            )
        dao.set_password.assert_not_called()


# === 旧测试（兼容） ===

class TestRegister:
    """旧 register 方法测试（兼容 register_with_password）。"""

    async def test_register_creates_user(self):
        dao = AsyncMock()
        dao.exists.return_value = False
        dao.create.return_value = _user()
        service = _make_service(dao)

        user = await service.register_with_password(
            username="alice", email="alice@example.com", password="password123"
        )

        assert user.username == "alice"
        _, kwargs = dao.create.call_args
        assert kwargs["password_hash"] != "password123"
