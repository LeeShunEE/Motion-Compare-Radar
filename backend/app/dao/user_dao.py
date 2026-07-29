"""用户数据访问对象。

DAO 层在 ``UserORM`` 与领域模型（``User`` / ``UserCredentials``）之间转换，
对上层只暴露领域模型，``*ORM`` 不越出本层。
"""

from datetime import UTC, datetime

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dao.orm import UserORM
from app.models.user import User, UserCredentials


def _to_user(orm: UserORM) -> User:
    return User(
        id=orm.id,
        username=orm.username,
        email=orm.email,
        is_verified=orm.is_verified,
        is_admin=orm.is_admin,
        is_active=orm.is_active,
        display_name=orm.display_name,
        last_login_at=orm.last_login_at,
        created_at=orm.created_at,
    )


class UserDAO:
    """用户表数据访问。"""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(
        self,
        *,
        email: str,
        password_hash: str | None = None,
        username: str | None = None,
        is_verified: bool = False,
        display_name: str | None = None,
    ) -> User:
        """创建用户。

        支持邮箱验证码注册（password_hash/username 可选）和 OAuth 登录（无密码）。
        """
        orm = UserORM(
            email=email,
            password_hash=password_hash,
            username=username,
            is_verified=is_verified,
            display_name=display_name,
        )
        self._session.add(orm)
        await self._session.commit()
        await self._session.refresh(orm)
        return _to_user(orm)

    async def get_by_id(self, user_id: int) -> User | None:
        orm = await self._session.get(UserORM, user_id)
        return _to_user(orm) if orm is not None else None

    async def get_by_username(self, username: str) -> User | None:
        stmt = select(UserORM).where(UserORM.username == username)
        orm = (await self._session.execute(stmt)).scalar_one_or_none()
        return _to_user(orm) if orm is not None else None

    async def get_by_email(self, email: str) -> User | None:
        """通过邮箱获取用户。"""
        stmt = select(UserORM).where(UserORM.email == email)
        orm = (await self._session.execute(stmt)).scalar_one_or_none()
        return _to_user(orm) if orm is not None else None

    async def exists_by_email(self, email: str) -> bool:
        """检查邮箱是否已注册。"""
        stmt = select(UserORM.id).where(UserORM.email == email)
        return (await self._session.execute(stmt)).first() is not None

    async def exists_by_username(self, username: str) -> bool:
        """检查用户名是否已存在。"""
        stmt = select(UserORM.id).where(UserORM.username == username)
        return (await self._session.execute(stmt)).first() is not None

    async def exists(self, *, username: str, email: str) -> bool:
        """检查用户名或邮箱是否已存在。"""
        stmt = select(UserORM.id).where(
            (UserORM.username == username) | (UserORM.email == email)
        )
        return (await self._session.execute(stmt)).first() is not None

    async def get_credentials_by_username(
        self, username: str
    ) -> UserCredentials | None:
        """通过用户名获取凭据（用于用户名+密码登录）。"""
        stmt = select(UserORM).where(UserORM.username == username)
        orm = (await self._session.execute(stmt)).scalar_one_or_none()
        if orm is None:
            return None
        return UserCredentials(
            user_id=orm.id,
            username=orm.username,
            password_hash_secret_string=orm.password_hash,
        )

    async def get_credentials_by_email(
        self, email: str
    ) -> UserCredentials | None:
        """通过邮箱获取凭据（用于邮箱+密码登录）。"""
        stmt = select(UserORM).where(UserORM.email == email)
        orm = (await self._session.execute(stmt)).scalar_one_or_none()
        if orm is None:
            return None
        return UserCredentials(
            user_id=orm.id,
            username=orm.username,
            password_hash_secret_string=orm.password_hash,
        )

    async def set_username(self, user_id: int, username: str) -> User:
        """设置用户名（OAuth 用户首次登录后设置）。"""
        orm = await self._session.get(UserORM, user_id)
        if orm is None:
            raise ValueError(f"用户 {user_id} 不存在")
        orm.username = username
        await self._session.commit()
        await self._session.refresh(orm)
        return _to_user(orm)

    async def set_password(self, user_id: int, password_hash: str) -> User:
        """设置密码（OAuth 用户后续设置密码）。"""
        orm = await self._session.get(UserORM, user_id)
        if orm is None:
            raise ValueError(f"用户 {user_id} 不存在")
        orm.password_hash = password_hash
        await self._session.commit()
        await self._session.refresh(orm)
        return _to_user(orm)

    async def set_verified(self, user_id: int, *, is_verified: bool = True) -> User:
        """设置邮箱验证状态。"""
        orm = await self._session.get(UserORM, user_id)
        if orm is None:
            raise ValueError(f"用户 {user_id} 不存在")
        orm.is_verified = is_verified
        await self._session.commit()
        await self._session.refresh(orm)
        return _to_user(orm)

    async def list_all_ids(self) -> list[int]:
        """返回所有用户 ID 列表（GC 遍历用）。"""
        stmt = select(UserORM.id)
        rows = (await self._session.execute(stmt)).scalars().all()
        return list(rows)

    async def record_successful_login(
        self, user_id: int, *, initial_admin_email: str | None
    ) -> User:
        """记录登录时间，并在系统无管理员时完成一次性管理员引导。"""
        orm = await self._session.get(UserORM, user_id, with_for_update=True)
        if orm is None:
            raise ValueError(f"用户 {user_id} 不存在")

        should_consider_bootstrap = (
            initial_admin_email is not None
            and orm.email.casefold() == initial_admin_email.casefold()
            and not orm.is_admin
        )
        if should_consider_bootstrap:
            admin_stmt = select(UserORM.id).where(UserORM.is_admin.is_(True)).limit(1)
            existing_admin_id = (
                await self._session.execute(admin_stmt)
            ).scalar_one_or_none()
            if existing_admin_id is None:
                orm.is_admin = True

        orm.last_login_at = datetime.now(tz=UTC)
        await self._session.commit()
        await self._session.refresh(orm)
        return _to_user(orm)

    async def list_filtered(
        self,
        *,
        search: str | None,
        is_admin: bool | None,
        is_active: bool | None,
        is_verified: bool | None,
        offset: int,
        limit: int,
    ) -> tuple[list[User], int]:
        """按管理条件分页查询用户。"""
        filters = []
        if search:
            pattern = f"%{search.casefold()}%"
            filters.append(
                or_(
                    func.lower(UserORM.email).like(pattern),
                    func.lower(UserORM.username).like(pattern),
                )
            )
        if is_admin is not None:
            filters.append(UserORM.is_admin.is_(is_admin))
        if is_active is not None:
            filters.append(UserORM.is_active.is_(is_active))
        if is_verified is not None:
            filters.append(UserORM.is_verified.is_(is_verified))

        stmt = select(UserORM).where(*filters)
        count_stmt = select(func.count(UserORM.id)).where(*filters)
        total = int((await self._session.execute(count_stmt)).scalar_one())
        rows = (
            await self._session.execute(
                stmt.order_by(UserORM.id.desc()).offset(offset).limit(limit)
            )
        ).scalars().all()
        return [_to_user(row) for row in rows], total

    async def count_active_admins(self) -> int:
        stmt = select(func.count(UserORM.id)).where(
            UserORM.is_admin.is_(True),
            UserORM.is_active.is_(True),
        )
        return int((await self._session.execute(stmt)).scalar_one())

    async def set_admin(self, user_id: int, *, is_admin: bool) -> User:
        orm = await self._session.get(UserORM, user_id, with_for_update=True)
        if orm is None:
            raise ValueError(f"用户 {user_id} 不存在")
        orm.is_admin = is_admin
        await self._session.commit()
        await self._session.refresh(orm)
        return _to_user(orm)

    async def set_active(self, user_id: int, *, is_active: bool) -> User:
        orm = await self._session.get(UserORM, user_id, with_for_update=True)
        if orm is None:
            raise ValueError(f"用户 {user_id} 不存在")
        orm.is_active = is_active
        await self._session.commit()
        await self._session.refresh(orm)
        return _to_user(orm)
