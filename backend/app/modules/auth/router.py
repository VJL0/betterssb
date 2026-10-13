from __future__ import annotations

import logging
from urllib.parse import urlencode

from fastapi import APIRouter, Request, Response, status
from fastapi.responses import RedirectResponse

from app.api.deps import DbDep, SettingsDep
from app.core.config import Settings
from app.modules.auth import service
from app.modules.auth.dependencies import (
    SESSION_COOKIE,
    SESSION_COOKIE_ATTRS,
    CurrentUserDep,
    GoogleClientDep,
    SessionTokenDep,
)
from app.modules.auth.errors import SignInError, SignInFailure
from app.modules.auth.providers import google as google_oauth
from app.modules.auth.schemas import UserResponse
from app.modules.auth.service import SESSION_ABSOLUTE_TIMEOUT

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


def _frontend_redirect(
    settings: Settings, error: SignInFailure | None = None
) -> RedirectResponse:
    url = settings.FRONTEND_URL
    if error:
        url = f"{url}?{urlencode({'auth_error': error})}"
    return RedirectResponse(url, status_code=status.HTTP_303_SEE_OTHER)


async def handle_sign_in_error(request: Request, exc: SignInError) -> Response:
    """Sign-in runs in the browser's address bar, so failures redirect to the
    frontend instead of returning a problem response.
    """
    # OWASP Logging Vocabulary event; %r escapes values from the callback URL.
    logger.warning("authn_login_fail: %r", str(exc))
    return _frontend_redirect(request.app.state.settings, error=exc.reason)


@router.get("/google/login")
async def google_login(
    request: Request, google: GoogleClientDep, settings: SettingsDep
) -> RedirectResponse:
    """Redirect to Google to sign in."""
    return await google_oauth.authorize_redirect(
        google, request, settings.GOOGLE_REDIRECT_URI
    )


@router.get("/google/callback")
async def google_callback(
    request: Request,
    session_token: SessionTokenDep,
    db: DbDep,
    google: GoogleClientDep,
    settings: SettingsDep,
) -> RedirectResponse:
    """Finish Google sign-in, start a session, and redirect to the frontend."""
    claims = await google_oauth.authorize(google, request)
    raw_token = await service.start_session(
        db,
        claims,
        previous_token=session_token,
        user_agent=request.headers.get("user-agent", ""),
        ip_address=request.client.host if request.client else "",
    )

    response = _frontend_redirect(settings)
    response.set_cookie(
        SESSION_COOKIE,
        raw_token,
        max_age=int(SESSION_ABSOLUTE_TIMEOUT.total_seconds()),
        **SESSION_COOKIE_ATTRS,
    )
    return response


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(session_token: SessionTokenDep, db: DbDep) -> Response:
    """Delete the session and clear its cookie."""
    if session_token:
        await service.end_session(db, session_token)
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    response.delete_cookie(SESSION_COOKIE, **SESSION_COOKIE_ATTRS)
    return response


@router.get("/me", response_model=UserResponse)
async def get_me(user: CurrentUserDep) -> UserResponse:
    """Return the signed-in user."""
    return UserResponse.model_validate(user, from_attributes=True)
