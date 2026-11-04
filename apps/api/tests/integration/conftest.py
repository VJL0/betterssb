from __future__ import annotations

from collections.abc import AsyncIterator

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.database import Base
from app.main import app


@pytest.fixture()
async def db(monkeypatch: pytest.MonkeyPatch) -> AsyncIterator[async_sessionmaker]:
    engine = create_async_engine("sqlite+aiosqlite://", poolclass=StaticPool)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    monkeypatch.setattr(app.state, "session_factory", factory, raising=False)
    yield factory
    await engine.dispose()
