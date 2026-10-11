from __future__ import annotations

import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from starlette.middleware.sessions import SessionMiddleware

from app.api.deps import get_engine, get_redis, get_settings
from app.api.router import api_router
from app.core.security import OAUTH_STATE_COOKIE, cookie_name
from app.integrations.google.client import HANDSHAKE_TTL_SECONDS

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncGenerator[None]:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)-8s [%(name)s] %(message)s",
    )
    # Schema is managed by Alembic (`alembic upgrade head`), not at startup.
    yield
    await get_engine().dispose()
    await get_redis().aclose()
    logger.info("Database engine and Redis client closed")


settings = get_settings()  # Fail fast on missing or invalid config.

app = FastAPI(title="BetterSSB API", version="0.1.0", lifespan=lifespan)

# Signed cookie for the OAuth handshake only. Signed-in sessions are server-side; see app/domains/auth.
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.SESSION_SECRET,
    session_cookie=cookie_name(OAUTH_STATE_COOKIE, settings.SESSION_COOKIE_SECURE),
    max_age=HANDSHAKE_TTL_SECONDS,
    same_site="lax",  # Strict would drop it on the redirect back from Google.
    https_only=settings.SESSION_COOKIE_SECURE,
)

app.include_router(api_router)


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}
