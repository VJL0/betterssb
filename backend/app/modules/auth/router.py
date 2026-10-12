from __future__ import annotations

import logging
from urllib.parse import urlencode

from fastapi import APIRouter, Request, Response, status
from fastapi.responses import RedirectResponse

from app.api.deps import DbDep, SettingsDep
from app.core.config import Settings
from app.modules.auth.dependencies import (
    SESSION_COOKIE,
    SESSION_COOKIE_ATTRS,
    AuthServiceDep,
    CurrentUserDep,
    GoogleClientDep,
    SessionTokenDep,
)
from app.modules.auth.providers.google import GoogleAuthError
from app.modules.auth.schemas import UserResponse
from app.modules.auth.service import SESSION_ABSOLUTE_TIMEOUT, InactiveUserError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


def _frontend_redirect(
    settings: Settings, error: str | None = None
) -> RedirectResponse:
    url = settings.FRONTEND_URL
    if error:
        url = f"{url}?{urlencode({'auth_error': error})}"
    return RedirectResponse(url, status_code=status.HTTP_303_SEE_OTHER)


@router.get("/google/login")
async def google_login(
    request: Request, google: GoogleClientDep, settings: SettingsDep
) -> RedirectResponse:
    """Redirect to Google to sign in."""
    return await google.authorize_redirect(request, settings.GOOGLE_REDIRECT_URI)


@router.get("/google/callback")
async def google_callback(
    request: Request,
    session_token: SessionTokenDep,
    db: DbDep,
    service: AuthServiceDep,
    google: GoogleClientDep,
    settings: SettingsDep,
) -> RedirectResponse:
    """Finish Google sign-in, start a session, and redirect to the frontend."""
    try:
        claims = await google.authorize(request)
    except GoogleAuthError as exc:
        logger.info("Google sign-in failed: %s", exc.error)
        # Don't reflect Google's error code; the frontend only needs to know
        # whether the user cancelled.
        return _frontend_redirect(
            settings,
            error="access_denied" if exc.error == "access_denied" else "failed",
        )

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
        SESSION_COOKIE,
        raw_token,
        max_age=int(SESSION_ABSOLUTE_TIMEOUT.total_seconds()),
        **SESSION_COOKIE_ATTRS,
    )
    return response


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    session_token: SessionTokenDep, db: DbDep, service: AuthServiceDep
) -> Response:
    """Delete the session and clear its cookie."""
    if session_token:
        await service.end_session(db, session_token)
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    response.delete_cookie(SESSION_COOKIE, **SESSION_COOKIE_ATTRS)
    return response


@router.get("/me", response_model=UserResponse)
async def get_me(response: Response, user: CurrentUserDep) -> UserResponse:
    """Return the signed-in user."""
    response.headers["Cache-Control"] = "no-store"
    return UserResponse(
        id=str(user.id), email=user.email, name=user.name, picture_url=user.picture_url
    )
