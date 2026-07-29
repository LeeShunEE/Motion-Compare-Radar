"""UserDAO 单元测试。"""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest
from pydantic import SecretStr

from app.dao.orm import UserORM
from app.dao.user_dao import UserDAO, _to_user
from app.models.user import User, UserCredentials


@pytest.fixture
def mock_session() -> AsyncMock:
    """Mock AsyncSession。"""
    return AsyncMock()


@pytest.fixture
def dao(mock_session: AsyncMock) -> UserDAO:
    """DAO 实例。"""
    return UserDAO(mock_session)


class TestToUser:
    """_to_user 转换测试。"""

    def test_converts_orm_to_user(self) -> None:
        """ORM 正确转换为 User 领域模型。"""
        orm = MagicMock(spec=UserORM)
        orm.id = 1
        orm.username = "alice"
        orm.email = "alice@example.com"
        orm.is_verified = True
        orm.is_admin = True
        orm.is_active = False
        orm.display_name = "Alice"
        orm.last_login_at = datetime(2026, 2, 1, tzinfo=UTC)
        orm.created_at = datetime(2026, 1, 1, tzinfo=UTC)

        user = _to_user(orm)
        assert user.id == 1
        assert user.username == "alice"
        assert user.email == "alice@example.com"
        assert user.is_verified is True
        assert user.is_admin is True
        assert user.is_active is False
        assert user.display_name == "Alice"
        assert user.last_login_at == datetime(2026, 2, 1, tzinfo=UTC)
        assert user.created_at == datetime(2026, 1, 1, tzinfo=UTC)

    def test_converts_orm_without_username(self) -> None:
        """ORM 无 username 时正确转换（OAuth 用户）。"""
        orm = MagicMock(spec=UserORM)
        orm.id = 1
        orm.username = None
        orm.email = "alice@example.com"
        orm.is_verified = True
        orm.display_name = None
        orm.created_at = datetime(2026, 1, 1, tzinfo=UTC)

        user = _to_user(orm)
        assert user.username is None


class TestCreate:
    """create 方法测试。"""

    async def test_create_returns_user(
        self, mock_session: AsyncMock
    ) -> None:
        """create 返回 User。"""
        # 创建一个预期的领域模型
        expected_user = User(
            id=1,
            username="alice",
            email="alice@example.com",
            is_verified=True,
            created_at=datetime(2026, 1, 1, tzinfo=UTC),
        )

        # Mock session 操作
        mock_session.add = MagicMock()
        mock_session.commit = AsyncMock()
        mock_session.refresh = AsyncMock()

        # Patch _to_user 以返回预期的领域模型
        import app.dao.user_dao as dao_module
        with pytest.MonkeyPatch.context() as m:
            m.setattr(dao_module, "_to_user", lambda _: expected_user)
            dao = UserDAO(mock_session)
            user = await dao.create(
                email="alice@example.com",
                password_hash="hashed_password",
                username="alice",
                is_verified=True,
            )

        mock_session.add.assert_called_once()
        mock_session.commit.assert_called_once()
        mock_session.refresh.assert_called_once()

        assert user.username == "alice"
        assert user.email == "alice@example.com"

    async def test_create_without_username(
        self, mock_session: AsyncMock
    ) -> None:
        """create 支持无 username（OAuth 用户）。"""
        expected_user = User(
            id=1,
            username=None,
            email="alice@example.com",
            is_verified=True,
            created_at=datetime(2026, 1, 1, tzinfo=UTC),
        )

        mock_session.add = MagicMock()
        mock_session.commit = AsyncMock()
        mock_session.refresh = AsyncMock()

        import app.dao.user_dao as dao_module
        with pytest.MonkeyPatch.context() as m:
            m.setattr(dao_module, "_to_user", lambda _: expected_user)
            dao = UserDAO(mock_session)
            user = await dao.create(
                email="alice@example.com",
                password_hash=None,
                username=None,
                is_verified=True,
            )

        assert user.username is None


class TestGetById:
    """get_by_id 方法测试。"""

    async def test_get_by_id_returns_user_when_found(
        self, dao: UserDAO, mock_session: AsyncMock
    ) -> None:
        """get_by_id 返回 User 当用户存在。"""
        orm = MagicMock()
        orm.id = 1
        orm.username = "alice"
        orm.email = "alice@example.com"
        orm.is_verified = True
        orm.display_name = None
        orm.created_at = datetime(2026, 1, 1, tzinfo=UTC)

        mock_session.get = AsyncMock(return_value=orm)

        user = await dao.get_by_id(1)
        assert user is not None
        assert user.id == 1
        assert user.username == "alice"

    async def test_get_by_id_returns_none_when_not_found(
        self, dao: UserDAO, mock_session: AsyncMock
    ) -> None:
        """get_by_id 返回 None 当用户不存在。"""
        mock_session.get = AsyncMock(return_value=None)

        user = await dao.get_by_id(999)
        assert user is None


class TestGetByUsername:
    """get_by_username 方法测试。"""

    async def test_get_by_username_returns_user_when_found(
        self, dao: UserDAO, mock_session: AsyncMock
    ) -> None:
        """get_by_username 返回 User 当用户存在。"""
        orm = MagicMock()
        orm.id = 1
        orm.username = "alice"
        orm.email = "alice@example.com"
        orm.is_verified = True
        orm.display_name = None
        orm.created_at = datetime(2026, 1, 1, tzinfo=UTC)

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = orm
        mock_session.execute = AsyncMock(return_value=mock_result)

        user = await dao.get_by_username("alice")
        assert user is not None
        assert user.username == "alice"

    async def test_get_by_username_returns_none_when_not_found(
        self, dao: UserDAO, mock_session: AsyncMock
    ) -> None:
        """get_by_username 返回 None 当用户不存在。"""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_session.execute = AsyncMock(return_value=mock_result)

        user = await dao.get_by_username("notfound")
        assert user is None


class TestGetByEmail:
    """get_by_email 方法测试。"""

    async def test_get_by_email_returns_user_when_found(
        self, dao: UserDAO, mock_session: AsyncMock
    ) -> None:
        """get_by_email 返回 User 当用户存在。"""
        orm = MagicMock()
        orm.id = 1
        orm.username = "alice"
        orm.email = "alice@example.com"
        orm.is_verified = True
        orm.display_name = None
        orm.created_at = datetime(2026, 1, 1, tzinfo=UTC)

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = orm
        mock_session.execute = AsyncMock(return_value=mock_result)

        user = await dao.get_by_email("alice@example.com")
        assert user is not None
        assert user.email == "alice@example.com"

    async def test_get_by_email_returns_none_when_not_found(
        self, dao: UserDAO, mock_session: AsyncMock
    ) -> None:
        """get_by_email 返回 None 当用户不存在。"""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_session.execute = AsyncMock(return_value=mock_result)

        user = await dao.get_by_email("notfound@example.com")
        assert user is None


class TestExistsByEmail:
    """exists_by_email 方法测试。"""

    async def test_exists_by_email_returns_true_when_found(
        self, dao: UserDAO, mock_session: AsyncMock
    ) -> None:
        """邮箱存在时返回 True。"""
        mock_result = MagicMock()
        mock_result.first.return_value = (1,)
        mock_session.execute = AsyncMock(return_value=mock_result)

        result = await dao.exists_by_email("alice@example.com")
        assert result is True

    async def test_exists_by_email_returns_false_when_not_found(
        self, dao: UserDAO, mock_session: AsyncMock
    ) -> None:
        """邮箱不存在时返回 False。"""
        mock_result = MagicMock()
        mock_result.first.return_value = None
        mock_session.execute = AsyncMock(return_value=mock_result)

        result = await dao.exists_by_email("notfound@example.com")
        assert result is False


class TestExists:
    """exists 方法测试。"""

    async def test_exists_returns_true_when_username_found(
        self, dao: UserDAO, mock_session: AsyncMock
    ) -> None:
        """用户名存在时返回 True。"""
        mock_result = MagicMock()
        mock_result.first.return_value = (1,)  # 返回一个 ID tuple
        mock_session.execute = AsyncMock(return_value=mock_result)

        result = await dao.exists(username="alice", email="other@example.com")
        assert result is True

    async def test_exists_returns_true_when_email_found(
        self, dao: UserDAO, mock_session: AsyncMock
    ) -> None:
        """邮箱存在时返回 True。"""
        mock_result = MagicMock()
        mock_result.first.return_value = (1,)  # 返回一个 ID tuple
        mock_session.execute = AsyncMock(return_value=mock_result)

        result = await dao.exists(username="other", email="alice@example.com")
        assert result is True

    async def test_exists_returns_false_when_not_found(
        self, dao: UserDAO, mock_session: AsyncMock
    ) -> None:
        """用户名和邮箱都不存在时返回 False。"""
        mock_result = MagicMock()
        mock_result.first.return_value = None
        mock_session.execute = AsyncMock(return_value=mock_result)

        result = await dao.exists(username="notfound", email="notfound@example.com")
        assert result is False


class TestGetCredentialsByUsername:
    """get_credentials_by_username 方法测试。"""

    async def test_get_credentials_returns_credentials_when_found(
        self, dao: UserDAO, mock_session: AsyncMock
    ) -> None:
        """get_credentials_by_username 返回凭据当用户存在。"""
        orm = MagicMock()
        orm.id = 1
        orm.username = "alice"
        orm.password_hash = "hashed_password"

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = orm
        mock_session.execute = AsyncMock(return_value=mock_result)

        creds = await dao.get_credentials_by_username("alice")
        assert creds is not None
        assert creds.user_id == 1
        assert creds.username == "alice"
        assert creds.password_hash_secret_string.get_secret_value() == "hashed_password"

    async def test_get_credentials_returns_none_when_not_found(
        self, dao: UserDAO, mock_session: AsyncMock
    ) -> None:
        """get_credentials_by_username 返回 None 当用户不存在。"""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_session.execute = AsyncMock(return_value=mock_result)

        creds = await dao.get_credentials_by_username("notfound")
        assert creds is None


class TestGetCredentialsByEmail:
    """get_credentials_by_email 方法测试。"""

    async def test_get_credentials_by_email_returns_credentials_when_found(
        self, dao: UserDAO, mock_session: AsyncMock
    ) -> None:
        """get_credentials_by_email 返回凭据当用户存在。"""
        orm = MagicMock()
        orm.id = 1
        orm.username = "alice"
        orm.password_hash = "hashed_password"

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = orm
        mock_session.execute = AsyncMock(return_value=mock_result)

        creds = await dao.get_credentials_by_email("alice@example.com")
        assert creds is not None
        assert creds.user_id == 1

    async def test_get_credentials_by_email_returns_none_when_not_found(
        self, dao: UserDAO, mock_session: AsyncMock
    ) -> None:
        """get_credentials_by_email 返回 None 当用户不存在。"""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_session.execute = AsyncMock(return_value=mock_result)

        creds = await dao.get_credentials_by_email("notfound@example.com")
        assert creds is None


class TestListAllIds:
    """list_all_ids 方法测试。"""

    async def test_list_all_ids_returns_ids(
        self, dao: UserDAO, mock_session: AsyncMock
    ) -> None:
        """list_all_ids 返回所有用户 ID 列表。"""
        mock_result = MagicMock()
        mock_scalars = MagicMock()
        mock_scalars.all.return_value = [1, 2, 3]
        mock_result.scalars.return_value = mock_scalars
        mock_session.execute = AsyncMock(return_value=mock_result)

        ids = await dao.list_all_ids()
        assert ids == [1, 2, 3]

    async def test_list_all_ids_returns_empty_when_none(
        self, dao: UserDAO, mock_session: AsyncMock
    ) -> None:
        """list_all_ids 返回空列表当无用户。"""
        mock_result = MagicMock()
        mock_scalars = MagicMock()
        mock_scalars.all.return_value = []
        mock_result.scalars.return_value = mock_scalars
        mock_session.execute = AsyncMock(return_value=mock_result)

        ids = await dao.list_all_ids()
        assert ids == []


class TestRecordSuccessfulLogin:
    async def test_promotes_matching_user_when_no_admin_exists(
        self, dao: UserDAO, mock_session: AsyncMock
    ) -> None:
        """仅首位匹配引导邮箱的登录用户获得管理员权限。"""
        orm = MagicMock(spec=UserORM)
        orm.id = 1
        orm.username = "alice"
        orm.email = "alice@example.com"
        orm.is_verified = True
        orm.is_admin = False
        orm.is_active = True
        orm.display_name = None
        orm.last_login_at = None
        orm.created_at = datetime(2026, 1, 1, tzinfo=UTC)
        mock_session.get.return_value = orm
        result = MagicMock()
        result.scalar_one_or_none.return_value = None
        mock_session.execute.return_value = result

        user = await dao.record_successful_login(
            1, initial_admin_email="Alice@Example.com"
        )

        assert user.is_admin is True
        assert user.last_login_at is not None
        mock_session.commit.assert_awaited_once()

    async def test_does_not_promote_when_an_admin_exists(
        self, dao: UserDAO, mock_session: AsyncMock
    ) -> None:
        orm = MagicMock(spec=UserORM)
        orm.id = 2
        orm.username = "bob"
        orm.email = "bob@example.com"
        orm.is_verified = True
        orm.is_admin = False
        orm.is_active = True
        orm.display_name = None
        orm.last_login_at = None
        orm.created_at = datetime(2026, 1, 1, tzinfo=UTC)
        mock_session.get.return_value = orm
        result = MagicMock()
        result.scalar_one_or_none.return_value = 1
        mock_session.execute.return_value = result

        user = await dao.record_successful_login(
            2, initial_admin_email="bob@example.com"
        )

        assert user.is_admin is False


class TestCountActiveAdminsForUpdate:
    async def test_locks_active_admin_rows_before_counting(
        self, dao: UserDAO, mock_session: AsyncMock
    ) -> None:
        result = MagicMock()
        scalars = MagicMock()
        scalars.all.return_value = [1, 2]
        result.scalars.return_value = scalars

        async def execute(statement):
            assert statement._for_update_arg is not None
            return result

        mock_session.execute = AsyncMock(side_effect=execute)

        count = await dao.count_active_admins_for_update()

        assert count == 2
