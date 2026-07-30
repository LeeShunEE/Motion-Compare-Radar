"""认证依赖的账号状态与管理员权限单元测试。"""

from datetime import UTC, datetime

import pytest

from app.api.deps import get_current_active_user, get_current_admin
from app.core.exceptions import AccountDisabledError, AdminRequiredError
from app.models.user import User


def _user(*, is_active: bool = True, is_admin: bool = False) -> User:
    return User(
        id=1,
        username="alice",
        email="alice@example.com",
        is_active=is_active,
        is_admin=is_admin,
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
    )


class TestCurrentActiveUser:
    async def test_disabled_account_is_rejected(self) -> None:
        """停用后，即使 JWT 尚未过期也必须立刻拒绝。"""
        with pytest.raises(AccountDisabledError) as exc_info:
            await get_current_active_user(_user(is_active=False))

        assert exc_info.value.code == "account_disabled"

    async def test_active_account_is_returned(self) -> None:
        user = _user()
        assert await get_current_active_user(user) is user


class TestCurrentAdmin:
    async def test_regular_user_is_rejected(self) -> None:
        with pytest.raises(AdminRequiredError) as exc_info:
            await get_current_admin(_user())

        assert exc_info.value.code == "admin_required"

    async def test_active_admin_is_returned(self) -> None:
        user = _user(is_admin=True)
        assert await get_current_admin(user) is user
