"""OAuthStateDAO 单元测试：用 in-memory SQLite 验证一次性消费与过期/不匹配拒绝。"""

import asyncio
from collections.abc import AsyncGenerator
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.dao.oauth_state_dao import OAuthStateDAO
from app.dao.orm import Base


@pytest.fixture
async def engine():
    eng = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    await eng.dispose()


@pytest.fixture
async def session(engine) -> AsyncGenerator[AsyncSession, None]:
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as s:
        yield s


def _future() -> datetime:
    return datetime.now(tz=UTC) + timedelta(minutes=10)


class TestConsume:
    async def test_valid_state_consumed_returns_true(self, session: AsyncSession):
        dao = OAuthStateDAO(session)
        await dao.create(state="s1", provider="google", expires_at=_future())

        assert await dao.consume(
            state="s1", provider="google", now=datetime.now(tz=UTC)
        )

    async def test_state_is_one_time_only(self, session: AsyncSession):
        dao = OAuthStateDAO(session)
        await dao.create(state="s1", provider="google", expires_at=_future())
        now = datetime.now(tz=UTC)

        assert await dao.consume(state="s1", provider="google", now=now)
        # 第二次消费同一 state 应失败（命中即焚，防重放）
        assert not await dao.consume(state="s1", provider="google", now=now)

    async def test_unknown_state_returns_false(self, session: AsyncSession):
        dao = OAuthStateDAO(session)
        assert not await dao.consume(
            state="nope", provider="google", now=datetime.now(tz=UTC)
        )

    async def test_provider_mismatch_returns_false(self, session: AsyncSession):
        dao = OAuthStateDAO(session)
        await dao.create(state="s1", provider="google", expires_at=_future())

        assert not await dao.consume(
            state="s1", provider="github", now=datetime.now(tz=UTC)
        )

    async def test_expired_state_returns_false(self, session: AsyncSession):
        dao = OAuthStateDAO(session)
        past = datetime.now(tz=UTC) - timedelta(minutes=1)
        await dao.create(state="s1", provider="google", expires_at=past)

        assert not await dao.consume(
            state="s1", provider="google", now=datetime.now(tz=UTC)
        )

    async def test_concurrent_consume_only_one_succeeds(self, engine) -> None:
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as setup:
            await OAuthStateDAO(setup).create(
                state="s1", provider="google", expires_at=_future()
            )

        now = datetime.now(tz=UTC)

        async def consume_once() -> bool:
            async with factory() as s:
                return await OAuthStateDAO(s).consume(
                    state="s1", provider="google", now=now
                )

        results = await asyncio.gather(consume_once(), consume_once())
        assert sorted(results) == [False, True]
