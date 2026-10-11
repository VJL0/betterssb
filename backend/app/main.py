from __future__ import annotations

import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.deps import get_engine, get_settings
from app.api.router import api_router

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncGenerator[None]:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)-8s [%(name)s] %(message)s",
    )
    get_settings()  # fail fast on missing/invalid config (e.g. JWT_SECRET)
    # Schema is managed by Alembic (`alembic upgrade head`), not at startup.
    yield
    await get_engine().dispose()
    logger.info("Database engine disposed")


app = FastAPI(title="BetterSSB API", version="0.1.0", lifespan=lifespan)

app.include_router(api_router)


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}
