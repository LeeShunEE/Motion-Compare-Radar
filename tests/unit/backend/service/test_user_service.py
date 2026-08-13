"""user_service 单元测试（DAO 全 mock）。"""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.core.exceptions import UserNotFoundError
from app.models.user import User
from app.service.user_service import UserService


def _make_service(dao: AsyncMock) -> UserService:
    service = UserService(session=MagicMock())
    service._dao = dao
    return service


def _user() -> User:
    return User(
        id=1,
        username="alice",
        email="alice@example.com",
        is_verified=True,
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
    )


class TestGetById:
    async def test_returns_user_when_found(self) -> None:
        dao = AsyncMock()
        dao.get_by_id.return_value = _user()
        service = _make_service(dao)

        result = await service.get_by_id(1)

        assert result.id == 1
        assert result.email == "alice@example.com"
        dao.get_by_id.assert_awaited_once_with(1)

    async def test_raises_when_missing(self) -> None:
        dao = AsyncMock()
        dao.get_by_id.return_value = None
        service = _make_service(dao)

        with pytest.raises(UserNotFoundError, match="用户不存在: id=99"):
            await service.get_by_id(99)

        dao.get_by_id.assert_awaited_once_with(99)


class TestExistsByEmail:
    async def test_returns_true_when_dao_finds_email(self) -> None:
        dao = AsyncMock()
        dao.exists_by_email.return_value = True
        service = _make_service(dao)

        result = await service.exists_by_email("alice@example.com")

        assert result is True
        dao.exists_by_email.assert_awaited_once_with("alice@example.com")

    async def test_returns_false_when_dao_misses_email(self) -> None:
        dao = AsyncMock()
        dao.exists_by_email.return_value = False
        service = _make_service(dao)

        result = await service.exists_by_email("ghost@example.com")

        assert result is False
        dao.exists_by_email.assert_awaited_once_with("ghost@example.com")
