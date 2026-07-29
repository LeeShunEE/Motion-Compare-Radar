"""渲染任务数据访问对象。

行级多租户：用户态查询一律带 ``user_id`` 过滤；队列消费用的内部查询（按 id）
不带用户过滤，仅供后台协程使用。
"""

from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.dao.orm import RenderTaskORM
from app.models.render_task import Codec, RenderMode, RenderStatus, RenderTask


def _to_domain(orm: RenderTaskORM) -> RenderTask:
    return RenderTask(
        id=orm.id,
        user_id=orm.user_id,
        mode=RenderMode(orm.mode),
        codec=Codec(orm.codec),
        status=RenderStatus(orm.status),
        input_props=orm.input_props,
        output_path=orm.output_path,
        error=orm.error,
        duration_ms=orm.duration_ms,
        created_at=orm.created_at,
        started_at=orm.started_at,
        finished_at=orm.finished_at,
        retry_of_task_id=orm.retry_of_task_id,
    )


def _utcnow() -> datetime:
    return datetime.now(tz=UTC)


class RenderTaskDAO:
    """渲染任务表数据访问。"""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(
        self,
        *,
        user_id: int,
        mode: RenderMode,
        codec: Codec,
        input_props: dict[str, Any],
        output_path: str,
        retry_of_task_id: int | None = None,
    ) -> RenderTask:
        orm = RenderTaskORM(
            user_id=user_id,
            mode=mode.value,
            codec=codec.value,
            status=RenderStatus.QUEUED.value,
            input_props=input_props,
            output_path=output_path,
            retry_of_task_id=retry_of_task_id,
        )
        self._session.add(orm)
        await self._session.commit()
        await self._session.refresh(orm)
        return _to_domain(orm)

    async def get(self, task_id: int) -> RenderTask | None:
        orm = await self._session.get(RenderTaskORM, task_id)
        return _to_domain(orm) if orm is not None else None

    async def get_for_user(self, task_id: int, user_id: int) -> RenderTask | None:
        stmt = select(RenderTaskORM).where(
            RenderTaskORM.id == task_id, RenderTaskORM.user_id == user_id
        )
        orm = (await self._session.execute(stmt)).scalar_one_or_none()
        return _to_domain(orm) if orm is not None else None

    async def list_for_user(self, user_id: int) -> list[RenderTask]:
        stmt = (
            select(RenderTaskORM)
            .where(RenderTaskORM.user_id == user_id)
            .order_by(RenderTaskORM.created_at.desc())
        )
        rows = (await self._session.execute(stmt)).scalars().all()
        return [_to_domain(r) for r in rows]

    async def list_queued_ids(self) -> list[int]:
        stmt = (
            select(RenderTaskORM.id)
            .where(RenderTaskORM.status == RenderStatus.QUEUED.value)
            .order_by(RenderTaskORM.created_at.asc())
        )
        return list((await self._session.execute(stmt)).scalars().all())

    async def list_global(
        self,
        *,
        user_id: int | None,
        status: RenderStatus | None,
        mode: RenderMode | None,
        codec: Codec | None,
        offset: int,
        limit: int,
    ) -> tuple[list[RenderTask], int]:
        filters = []
        if user_id is not None:
            filters.append(RenderTaskORM.user_id == user_id)
        if status is not None:
            filters.append(RenderTaskORM.status == status.value)
        if mode is not None:
            filters.append(RenderTaskORM.mode == mode.value)
        if codec is not None:
            filters.append(RenderTaskORM.codec == codec.value)
        count_stmt = select(func.count(RenderTaskORM.id)).where(*filters)
        total = int((await self._session.execute(count_stmt)).scalar_one())
        stmt = (
            select(RenderTaskORM)
            .where(*filters)
            .order_by(RenderTaskORM.created_at.desc(), RenderTaskORM.id.desc())
            .offset(offset)
            .limit(limit)
        )
        rows = (await self._session.execute(stmt)).scalars().all()
        return [_to_domain(row) for row in rows], total

    async def _set_status(self, task_id: int, **values: Any) -> None:  # noqa: ANN401
        await self._session.execute(
            update(RenderTaskORM).where(RenderTaskORM.id == task_id).values(**values)
        )
        await self._session.commit()

    async def mark_running(self, task_id: int) -> None:
        await self._set_status(
            task_id, status=RenderStatus.RUNNING.value, started_at=_utcnow()
        )

    async def mark_done(
        self, task_id: int, output_path: str, duration_ms: int
    ) -> None:
        await self._set_status(
            task_id,
            status=RenderStatus.DONE.value,
            output_path=output_path,
            duration_ms=duration_ms,
            finished_at=_utcnow(),
        )

    async def mark_failed(self, task_id: int, error: str) -> None:
        await self._set_status(
            task_id,
            status=RenderStatus.FAILED.value,
            error=error,
            finished_at=_utcnow(),
        )

    async def mark_canceled(self, task_id: int) -> None:
        await self._set_status(
            task_id, status=RenderStatus.CANCELED.value, finished_at=_utcnow()
        )

    async def requeue_running(self) -> None:
        """把上次进程残留的 running 任务重置为 queued（重启恢复用）。"""
        await self._session.execute(
            update(RenderTaskORM)
            .where(RenderTaskORM.status == RenderStatus.RUNNING.value)
            .values(status=RenderStatus.QUEUED.value, started_at=None)
        )
        await self._session.commit()

    async def delete(self, task_id: int) -> None:
        orm = await self._session.get(RenderTaskORM, task_id)
        if orm is not None:
            await self._session.delete(orm)
            await self._session.commit()

    async def list_done_for_user(self, user_id: int) -> list[RenderTask]:
        """返回用户所有 done 任务，按 finished_at 升序排序（GC 配额清理用）。"""
        stmt = (
            select(RenderTaskORM)
            .where(
                RenderTaskORM.user_id == user_id,
                RenderTaskORM.status == RenderStatus.DONE.value,
            )
            .order_by(RenderTaskORM.finished_at.asc())
        )
        rows = (await self._session.execute(stmt)).scalars().all()
        return [_to_domain(r) for r in rows]

    async def list_expired_for_user(
        self, user_id: int, max_age_days: int
    ) -> list[RenderTask]:
        """返回超过保留天数的 done 任务（GC 时间维度清理用）。

        过期判定：finished_at + max_age_days < now（UTC）。
        """
        cutoff = _utcnow() - timedelta(days=max_age_days)
        stmt = (
            select(RenderTaskORM)
            .where(
                RenderTaskORM.user_id == user_id,
                RenderTaskORM.status == RenderStatus.DONE.value,
                RenderTaskORM.finished_at < cutoff,
            )
            .order_by(RenderTaskORM.finished_at.asc())
        )
        rows = (await self._session.execute(stmt)).scalars().all()
        return [_to_domain(r) for r in rows]
