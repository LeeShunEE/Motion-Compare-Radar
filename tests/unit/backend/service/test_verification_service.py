"""verification_service 单元测试（DAO 全 mock，覆盖生成/校验/冷却分支）。"""

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.core.config import settings
from app.core.exceptions import (
    VerificationCodeCooldownError,
    VerificationCodeExpiredError,
    VerificationCodeInvalidError,
)
from app.dao.orm import VerificationCodeORM
from app.service.verification_service import VerificationService


def _make_service(dao: AsyncMock) -> VerificationService:
    service = VerificationService.__new__(VerificationService)
    service._dao = dao
    return service


def _orm(code: str = "123456", *, expired: bool = False) -> MagicMock:
    mock_orm = MagicMock(spec=VerificationCodeORM)
    mock_orm.code = code
    mock_orm.expires_at = (
        datetime.now(tz=UTC) - timedelta(minutes=1)
        if expired
        else datetime.now(tz=UTC) + timedelta(minutes=10)
    )
    return mock_orm


class TestGenerateCode:
    async def test_generate_code_stores_and_returns(self, monkeypatch):
        dao = AsyncMock()
        dao.get_latest_for_cooldown_check.return_value = None
        service = _make_service(dao)

        code = await service.generate_code("a@b.com", "register")

        assert len(code) == settings.verification_code_length
        assert code.isdigit()
        dao.create.assert_awaited_once()
        _, kwargs = dao.create.call_args
        assert kwargs["email"] == "a@b.com"
        assert kwargs["purpose"] == "register"

    async def test_generate_code_cooldown_raises(self, monkeypatch):
        dao = AsyncMock()
        latest = MagicMock()
        latest.created_at = datetime.now(tz=UTC)
        dao.get_latest_for_cooldown_check.return_value = latest
        service = _make_service(dao)

        monkeypatch.setattr(settings, "verification_code_cooldown_seconds", 60)

        with pytest.raises(VerificationCodeCooldownError):
            await service.generate_code("a@b.com", "register")
        dao.create.assert_not_called()

    async def test_generate_code_after_cooldown_ok(self, monkeypatch):
        dao = AsyncMock()
        latest = MagicMock()
        latest.created_at = datetime.now(tz=UTC) - timedelta(minutes=5)
        dao.get_latest_for_cooldown_check.return_value = latest
        service = _make_service(dao)

        monkeypatch.setattr(settings, "verification_code_cooldown_seconds", 60)

        code = await service.generate_code("a@b.com", "register")
        assert code.isdigit()


class TestVerifyCode:
    async def test_verify_success_marks_used(self):
        dao = AsyncMock()
        orm = _orm("123456")
        dao.get_latest_unused.return_value = orm
        service = _make_service(dao)

        ok = await service.verify_code("a@b.com", "123456", "register")

        assert ok is True
        dao.mark_used.assert_awaited_once_with(orm)

    async def test_verify_missing_raises_invalid(self):
        dao = AsyncMock()
        dao.get_latest_unused.return_value = None
        service = _make_service(dao)

        with pytest.raises(VerificationCodeInvalidError):
            await service.verify_code("a@b.com", "123456", "register")
        dao.mark_used.assert_not_called()

    async def test_verify_wrong_code_raises_invalid(self):
        dao = AsyncMock()
        dao.get_latest_unused.return_value = _orm("123456")
        service = _make_service(dao)

        with pytest.raises(VerificationCodeInvalidError):
            await service.verify_code("a@b.com", "999999", "register")
        dao.mark_used.assert_not_called()

    async def test_verify_expired_raises(self):
        dao = AsyncMock()
        dao.get_latest_unused.return_value = _orm("123456", expired=True)
        service = _make_service(dao)

        with pytest.raises(VerificationCodeExpiredError):
            await service.verify_code("a@b.com", "123456", "register")
        dao.mark_used.assert_not_called()


class TestGenerateNumericCode:
    def test_length_matches(self):
        service = _make_service(AsyncMock())
        code = service._generate_numeric_code(6)
        assert len(code) == 6
        assert code.isdigit()
