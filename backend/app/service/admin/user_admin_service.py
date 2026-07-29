"""管理员用户查询、角色和状态控制。"""

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import AdminSafetyError, UserNotFoundError
from app.dao.audit_event_dao import AuditEventDAO
from app.dao.render_task_dao import RenderTaskDAO
from app.dao.user_dao import UserDAO
from app.models.admin_user import AdminUserDetail, UserUsageSummary
from app.models.audit_event import AuditAction
from app.models.render_task import RenderStatus
from app.models.user import User
from app.service.audit_service import AuditService
from app.service.file_service import FileService


class UserAdminService:
    """用户管理用例与最后管理员保护。"""

    def __init__(self, session: AsyncSession) -> None:
        self._user_dao = UserDAO(session)
        self._render_dao = RenderTaskDAO(session)
        self._audit_dao = AuditEventDAO(session)
        self._audit = AuditService(session)
        self._files = FileService(
            settings.storage_root,
            settings.max_user_storage_bytes,
            settings.max_user_upload_count,
        )

    async def list_users(
        self,
        *,
        search: str | None,
        is_admin: bool | None,
        is_active: bool | None,
        is_verified: bool | None,
        page: int,
        page_size: int,
    ) -> tuple[list[User], int]:
        return await self._user_dao.list_filtered(
            search=search,
            is_admin=is_admin,
            is_active=is_active,
            is_verified=is_verified,
            offset=(page - 1) * page_size,
            limit=page_size,
        )

    async def get_user(self, user_id: int) -> User:
        user = await self._user_dao.get_by_id(user_id)
        if user is None:
            raise UserNotFoundError(f"用户不存在: id={user_id}")
        return user

    async def get_user_detail(self, user_id: int) -> AdminUserDetail:
        """聚合用户身份、文件用量、渲染结果和审计活动计数。"""
        user = await self.get_user(user_id)
        tasks = await self._render_dao.list_for_user(user_id)
        activity_count = await self._audit_dao.count_for_user(user_id)

        storage_partial = False
        try:
            upload_usage = self._files.usage(user_id)
            output_bytes = self._files.output_usage_bytes(user_id)
        except OSError:
            upload_usage = None
            output_bytes = 0
            storage_partial = True

        done = sum(task.status is RenderStatus.DONE for task in tasks)
        failed = sum(task.status is RenderStatus.FAILED for task in tasks)
        canceled = sum(task.status is RenderStatus.CANCELED for task in tasks)
        terminal = done + failed + canceled
        usage = UserUsageSummary(
            upload_count=upload_usage.upload_count if upload_usage else 0,
            upload_bytes=upload_usage.used_bytes if upload_usage else 0,
            output_bytes=output_bytes,
            render_total=len(tasks),
            render_done=done,
            render_failed=failed,
            render_canceled=canceled,
            render_success_rate=done / terminal if terminal else 0,
            activity_count=activity_count,
            storage_partial=storage_partial,
        )
        return AdminUserDetail(user=user, usage=usage)

    async def set_role(
        self,
        *,
        actor_user_id: int,
        target_user_id: int,
        is_admin: bool,
    ) -> User:
        if actor_user_id == target_user_id and not is_admin:
            raise AdminSafetyError("不能撤销自己的管理员权限")
        target = await self.get_user(target_user_id)
        if (
            target.is_admin
            and target.is_active
            and not is_admin
            and await self._user_dao.count_active_admins() <= 1
        ):
            raise AdminSafetyError("不能撤销最后一位启用管理员")
        updated = await self._user_dao.set_admin(target_user_id, is_admin=is_admin)
        await self._audit.record(
            AuditAction.ADMIN_ROLE_GRANTED
            if is_admin
            else AuditAction.ADMIN_ROLE_REVOKED,
            actor_user_id=actor_user_id,
            subject_user_id=target_user_id,
            resource_type="user",
            resource_id=str(target_user_id),
            metadata={"role": "admin" if is_admin else "user"},
        )
        return updated

    async def set_status(
        self,
        *,
        actor_user_id: int,
        target_user_id: int,
        is_active: bool,
    ) -> User:
        if actor_user_id == target_user_id and not is_active:
            raise AdminSafetyError("不能停用自己的账号")
        target = await self.get_user(target_user_id)
        if (
            target.is_admin
            and target.is_active
            and not is_active
            and await self._user_dao.count_active_admins() <= 1
        ):
            raise AdminSafetyError("不能停用最后一位启用管理员")
        updated = await self._user_dao.set_active(target_user_id, is_active=is_active)
        await self._audit.record(
            AuditAction.ADMIN_USER_ACTIVATED
            if is_active
            else AuditAction.ADMIN_USER_DEACTIVATED,
            actor_user_id=actor_user_id,
            subject_user_id=target_user_id,
            resource_type="user",
            resource_id=str(target_user_id),
            metadata={"status": "active" if is_active else "disabled"},
        )
        return updated
