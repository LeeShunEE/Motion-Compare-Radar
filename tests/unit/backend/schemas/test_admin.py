"""管理员接口契约：AdminUserResponse 字段映射。"""

from datetime import UTC, datetime

from app.models.user import User
from app.schemas.admin import AdminUserResponse


def _user(*, display_name: str | None = "Alice From Google") -> User:
    return User(
        id=9,
        username="alice",
        email="alice@example.com",
        is_verified=True,
        is_admin=False,
        is_active=True,
        display_name=display_name,
        last_login_at=None,
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
    )


class TestAdminUserResponseFromDomain:
    def test_maps_display_name(self) -> None:
        response = AdminUserResponse.from_domain(_user())
        assert response.display_name == "Alice From Google"
        dumped = response.model_dump()
        assert dumped["display_name"] == "Alice From Google"
        assert "password" not in dumped
        assert "password_hash_secret_string" not in dumped

    def test_maps_missing_display_name_as_none(self) -> None:
        response = AdminUserResponse.from_domain(_user(display_name=None))
        assert response.display_name is None
