"""user_service 单元测试（DAO 全 mock）。"""

from unittest.mock import AsyncMock, MagicMock

from app.service.user_service import UserService


def _make_service(dao: AsyncMock) -> UserService:
    service = UserService(session=MagicMock())
    service._dao = dao
    return service


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
