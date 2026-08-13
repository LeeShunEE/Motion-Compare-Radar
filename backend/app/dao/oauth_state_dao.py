"""OAuth state（CSRF nonce）数据访问对象。

只暴露「创建」与「一次性消费」两个操作；``*ORM`` 不越出本层。
消费用原子 DELETE … RETURNING，避免并发双读同一行。
"""

from datetime import datetime

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.dao.orm import OAuthStateORM
from app.utils.datetime import ensure_utc


class OAuthStateDAO:
    """OAuth state 表数据访问。"""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(
        self, *, state: str, provider: str, expires_at: datetime
    ) -> None:
        """落库一条 state 记录。"""
        self._session.add(
            OAuthStateORM(state=state, provider=provider, expires_at=expires_at)
        )
        await self._session.commit()

    async def consume(self, *, state: str, provider: str, now: datetime) -> bool:
        """一次性消费 state：原子删除该行，再校验 provider 与过期。

        用 DELETE … RETURNING，避免 SELECT + DELETE 之间两个请求都读到同一行。
        命中即焚：只要 state 存在就删；provider 不匹配或已过期返回 False。

        Args:
            state: 回调带回的 state
            provider: 期望的 provider（防止跨 provider 重用）
            now: 当前 UTC aware 时间

        Returns:
            校验是否通过
        """
        stmt = (
            delete(OAuthStateORM)
            .where(OAuthStateORM.state == state)
            .returning(OAuthStateORM.provider, OAuthStateORM.expires_at)
        )
        result = await self._session.execute(stmt)
        row = result.one_or_none()
        await self._session.commit()

        if row is None:
            return False
        row_provider, expires_at = row
        if row_provider != provider:
            return False
        return ensure_utc(expires_at) >= now
