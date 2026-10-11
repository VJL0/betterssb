from __future__ import annotations

from functools import lru_cache

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_redis, get_settings
from app.core.config import Settings
from app.core.security import SESSION_COOKIE, cookie_name
from app.domains.auth.models import User
from app.domains.auth.service import AuthService
from app.integrations.google.client import GoogleOAuthClient


def get_auth_service(settings: Settings = Depends(get_settings)) -> AuthService:
    return AuthService(settings)


@lru_cache
def get_google_client() -> GoogleOAuthClient:
    """Return the shared Google client, which caches Google's discovery document and keys."""
    settings = get_settings()
    return GoogleOAuthClient(settings.GOOGLE_CLIENT_ID, settings.GOOGLE_CLIENT_SECRET, cache=get_redis())


def get_session_token(request: Request, settings: Settings = Depends(get_settings)) -> str | None:
    return request.cookies.get(cookie_name(SESSION_COOKIE, settings.SESSION_COOKIE_SECURE))


async def get_current_user(
    token: str | None = Depends(get_session_token),
    db: AsyncSession = Depends(get_db),
    service: AuthService = Depends(get_auth_service),
) -> User:
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    user = await service.get_session_user(db, token)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired")

    return user
