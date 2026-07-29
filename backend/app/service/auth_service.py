"""认证服务：注册与登录校验。

入站时在 service 内显式构造领域模型；token 签发由调用方（路由）用 core.security 完成。
"""

from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import (
    AccountDisabledError,
    AuthError,
    UserExistsError,
    UserNotFoundError,
    VerificationCodeExpiredError,
    VerificationCodeInvalidError,
)
from app.core.security import hash_password, verify_password
from app.dao.user_dao import UserDAO
from app.dao.verification_dao import VerificationCodeDAO
from app.models.audit_event import AuditAction
from app.models.user import User
from app.service.audit_service import AuditService
from app.utils.datetime import ensure_utc


class AuthService:
    """注册 / 认证用例。"""

    def __init__(self, session: AsyncSession) -> None:
        self._dao = UserDAO(session)
        self._verification_dao = VerificationCodeDAO(session)
        self._audit = AuditService(session)

    async def _complete_login(self, user_id: int) -> User:
        user = await self._dao.record_successful_login(
            user_id,
            initial_admin_email=settings.initial_admin_email,
        )
        await self._audit.record(
            AuditAction.AUTH_LOGIN_SUCCEEDED,
            actor_user_id=user.id,
            subject_user_id=user.id,
            resource_type="user",
            resource_id=str(user.id),
        )
        return user

    async def register_with_password(
        self, *, username: str, email: str, password: str
    ) -> User:
        """用户名密码注册（保留用于兼容）。"""
        if await self._dao.exists(username=username, email=email):
            raise UserExistsError("用户名或邮箱已被占用")
        return await self._dao.create(
            username=username,
            email=email,
            password_hash=hash_password(password),
            is_verified=False,
        )

    async def verify_and_register(self, *, email: str, code: str) -> User:
        """验证码校验后注册。

        Args:
            email: 用户邮箱
            code: 用户输入的验证码

        Returns:
            创建的用户（已验证）

        Raises:
            VerificationCodeInvalidError: 验证码无效
            VerificationCodeExpiredError: 验证码过期
            UserExistsError: 邮箱已注册
        """
        # 校验验证码
        orm = await self._verification_dao.get_latest_unused(email, "register")
        if orm is None:
            raise VerificationCodeInvalidError("验证码无效或已使用")
        if orm.code != code:
            raise VerificationCodeInvalidError("验证码错误")
        if ensure_utc(orm.expires_at) < datetime.now(tz=UTC):
            raise VerificationCodeExpiredError("验证码已过期，请重新获取")

        # 标记验证码已使用
        await self._verification_dao.mark_used(orm)

        # 检查邮箱是否已注册
        if await self._dao.exists_by_email(email):
            raise UserExistsError("邮箱已注册")

        # 创建用户（无用户名、无密码、已验证）
        user = await self._dao.create(
            email=email,
            password_hash=None,
            username=None,
            is_verified=True,
        )

        return await self._complete_login(user.id)

    async def authenticate(self, *, username: str | None = None, email: str | None = None, password: str) -> User:
        """校验账号口令，成功返回用户；失败抛 ``AuthError``。

        支持用户名或邮箱登录。
        """
        # 获取凭据
        credentials = None
        if username is not None:
            credentials = await self._dao.get_credentials_by_username(username)
        elif email is not None:
            credentials = await self._dao.get_credentials_by_email(email)

        if credentials is None:
            raise AuthError("用户名/邮箱或密码错误")

        # 检查用户是否设置了密码
        if credentials.password_hash_secret_string is None:
            raise AuthError("该账户未设置密码，请使用 OAuth 登录或设置密码")

        # 验证密码
        ok = verify_password(
            password,
            credentials.password_hash_secret_string.get_secret_value(),
        )
        if not ok:
            raise AuthError("用户名/邮箱或密码错误")

        # 获取用户
        user = await self._dao.get_by_id(credentials.user_id)
        if user is None:  # 极端竞态：凭据存在但用户被删
            raise AuthError("用户名/邮箱或密码错误")
        if not user.is_active:
            raise AccountDisabledError("账号已停用")
        return await self._complete_login(user.id)

    async def set_username(self, user_id: int, username: str) -> User:
        """设置用户名（OAuth 用户首次登录后设置）。"""
        # 检查用户名是否已存在
        if await self._dao.exists_by_username(username):
            raise UserExistsError("用户名已被占用")
        return await self._dao.set_username(user_id, username)

    async def set_password(self, user_id: int, password: str) -> User:
        """设置密码（OAuth 用户后续设置密码）。"""
        return await self._dao.set_password(user_id, hash_password(password))

    async def reset_password(
        self, *, email: str, code: str, new_password: str
    ) -> User:
        """重置密码：验证码校验后设新密码。

        复用 register 的验证码校验逻辑（reset_password purpose），校验通过后
        写入新密码哈希。解决邮箱注册用户无密码时无法用密码登录的中断死锁。

        Args:
            email: 用户邮箱
            code: 用户输入的重置验证码
            new_password: 新密码明文

        Returns:
            重置密码后的用户

        Raises:
            VerificationCodeInvalidError: 验证码无效或已使用
            VerificationCodeExpiredError: 验证码过期
            UserNotFoundError: 邮箱未注册
        """
        # 校验验证码（与 verify_and_register 一致的判定顺序：先校验再标记已用）
        orm = await self._verification_dao.get_latest_unused(email, "reset_password")
        if orm is None:
            raise VerificationCodeInvalidError("验证码无效或已使用")
        if orm.code != code:
            raise VerificationCodeInvalidError("验证码错误")
        if ensure_utc(orm.expires_at) < datetime.now(tz=UTC):
            raise VerificationCodeExpiredError("验证码已过期，请重新获取")

        await self._verification_dao.mark_used(orm)

        # 定位用户，不存在则抛业务异常（空有业务含义，源头拦截）
        user = await self._dao.get_by_email(email)
        if user is None:
            raise UserNotFoundError("用户不存在")

        return await self._dao.set_password(user.id, hash_password(new_password))
