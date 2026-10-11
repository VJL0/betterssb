from __future__ import annotations

import logging
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_settings
from app.core.config import Settings
from app.core.security import SESSION_COOKIE, cookie_name
from app.domains.auth.dependencies import get_auth_service, get_current_user, get_google_client, get_session_token
from app.domains.auth.models import User
from app.domains.auth.schemas import UserResponse
from app.domains.auth.service import AuthService, InactiveUserError
from app.integrations.google.client import GoogleAuthError, GoogleOAuthClient

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


def _user_response(user: User) -> UserResponse:
    return UserResponse(
        id=str(user.id),
        email=user.email,
        name=user.name,
        picture_url=user.picture_url,
    )


def _frontend_redirect(settings: Settings, error: str | None = None) -> RedirectResponse:
    url = settings.FRONTEND_URL
    if error:
        url = f"{url}?{urlencode({'auth_error': error})}"
    return RedirectResponse(url, status_code=status.HTTP_303_SEE_OTHER)


def _session_cookie(settings: Settings) -> dict:
    """Return the session cookie's attributes, shared by set and delete so they always match."""
    secure = settings.SESSION_COOKIE_SECURE
    return {
        "key": cookie_name(SESSION_COOKIE, secure),
        "path": "/",
        "secure": secure,
        "httponly": True,
        "samesite": "lax",
    }


@router.get("/google/login")
async def google_login(
    request: Request,
    google: GoogleOAuthClient = Depends(get_google_client),
    settings: Settings = Depends(get_settings),
) -> RedirectResponse:
    """Redirect to Google to sign in."""
    return await google.authorize_redirect(request, settings.GOOGLE_REDIRECT_URI)


@router.get("/google/callback")
async def google_callback(
    request: Request,
    session_token: str | None = Depends(get_session_token),
    db: AsyncSession = Depends(get_db),
    service: AuthService = Depends(get_auth_service),
    google: GoogleOAuthClient = Depends(get_google_client),
    settings: Settings = Depends(get_settings),
) -> RedirectResponse:
    """Finish Google sign-in, start a session, and redirect to the frontend."""
    try:
        claims = await google.authorize(request)
    except GoogleAuthError as exc:
        logger.info("Google sign-in failed: %s", exc.error)
        # Don't reflect Google's error code; the frontend only needs to know if the user cancelled.
        return _frontend_redirect(settings, error="access_denied" if exc.error == "access_denied" else "failed")

    try:
        raw_token = await service.start_session(
            db,
            claims,
            previous_token=session_token,
            user_agent=request.headers.get("user-agent", ""),
            ip_address=request.client.host if request.client else "",
        )
    except InactiveUserError:
        return _frontend_redirect(settings, error="account_disabled")

    response = _frontend_redirect(settings)
    response.set_cookie(
        value=raw_token,
        max_age=settings.SESSION_ABSOLUTE_TIMEOUT_DAYS * 24 * 60 * 60,
        **_session_cookie(settings),
    )
    return response


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    session_token: str | None = Depends(get_session_token),
    db: AsyncSession = Depends(get_db),
    service: AuthService = Depends(get_auth_service),
    settings: Settings = Depends(get_settings),
) -> Response:
    """Delete the session and clear its cookie."""
    if session_token:
        await service.end_session(db, session_token)
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    response.delete_cookie(**_session_cookie(settings))
    return response


@router.get("/me", response_model=UserResponse)
async def get_me(response: Response, user: User = Depends(get_current_user)) -> UserResponse:
    """Return the signed-in user."""
    response.headers["Cache-Control"] = "no-store"
    return _user_response(user)
