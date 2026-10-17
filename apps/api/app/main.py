from __future__ import annotations

import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from starlette.middleware.sessions import SessionMiddleware

from app.api.router import api_router
from app.core.config import Settings
from app.core.errors import add_error_handlers
from app.core.security import SecurityHeadersMiddleware
from app.modules.auth.errors import SignInError
from app.modules.auth.providers.google import (
    HANDSHAKE_TTL_SECONDS,
    create_google_client,
)
from app.modules.auth.router import handle_sign_in_error


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)-8s [%(name)s] %(message)s",
    )
    settings: Settings = app.state.settings
    engine = create_async_engine(settings.DATABASE_URL, pool_pre_ping=True)
    async with Redis.from_url(settings.REDIS_URL) as redis:
        app.state.session_factory = async_sessionmaker(engine, expire_on_commit=False)
        app.state.redis = redis
        app.state.google = create_google_client(
            settings.GOOGLE_CLIENT_ID, settings.GOOGLE_CLIENT_SECRET, cache=redis
        )
        try:
            yield
        finally:
            await engine.dispose()


settings = Settings()  # Fail fast on missing or invalid config.

app = FastAPI(title="BetterSSB API", version="0.1.0", lifespan=lifespan)
app.state.settings = settings

# Signed cookie for the OAuth handshake only. Signed-in sessions are server-side;
# see app/modules/auth.
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.SESSION_SECRET,
    session_cookie="__Host-Http-oauth",
    max_age=HANDSHAKE_TTL_SECONDS,
    path="/",
    same_site="lax",
    https_only=True,
)
app.add_middleware(SecurityHeadersMiddleware)

add_error_handlers(app)
app.add_exception_handler(SignInError, handle_sign_in_error)

app.include_router(api_router)


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}
