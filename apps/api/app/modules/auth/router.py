from __future__ import annotations

import logging
import re
from typing import Annotated
from urllib.parse import urlencode

from fastapi import APIRouter, Query, Request, Response, status
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

# Where to send the browser after sign-in, kept in the signed handshake cookie.
RETURN_PATH_SESSION_KEY = "return_path"
# Keeps the handshake cookie well under the browser's 4 KB limit.
MAX_RETURN_PATH_LENGTH = 2048
# A path on the frontend. Browsers read `//host` and `/\host` as another host,
# and drop tabs and newlines, so those are refused.
RETURN_PATH_PATTERN = re.compile(r"/(?![/\\])[^\\\x00-\x20\x7f]*")


def _safe_return_path(value: str | None) -> str | None:
    """`value` if it's a path on the frontend, else None (back to the home page)."""
    if (
        value
        and len(value) <= MAX_RETURN_PATH_LENGTH
        and RETURN_PATH_PATTERN.fullmatch(value)
    ):
        return value
    return None


def _frontend_redirect(
    settings: Settings,
    return_path: str | None = None,
    error: SignInFailure | None = None,
) -> RedirectResponse:
    url = settings.FRONTEND_URL + (return_path or "")
    if error:
        separator = "&" if "?" in url else "?"
        url = f"{url}{separator}{urlencode({'auth_error': error})}"
    return RedirectResponse(url, status_code=status.HTTP_303_SEE_OTHER)


async def handle_sign_in_error(request: Request, exc: SignInError) -> Response:
    """Sign-in runs in the browser's address bar, so failures redirect to the
    page sign-in started on instead of returning a problem response.
    """
    # OWASP Logging Vocabulary event; %r escapes values from the callback URL.
    logger.warning("authn_login_fail: %r", str(exc))
    return_path = request.session.pop(RETURN_PATH_SESSION_KEY, None)
    return _frontend_redirect(request.app.state.settings, return_path, error=exc.reason)


@router.get("/google/login")
async def google_login(
    request: Request,
    google: GoogleClientDep,
    settings: SettingsDep,
    next_path: Annotated[
        str | None,
        Query(
            alias="next",
            description="The frontend page to return to, such as `/search?q=CIS`.",
        ),
    ] = None,
) -> RedirectResponse:
    """Redirect to Google to sign in."""
    # Always set, so a sign-in abandoned at Google leaves no stale path behind.
    request.session[RETURN_PATH_SESSION_KEY] = _safe_return_path(next_path)
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
    """Finish Google sign-in, start a session, and return to the page it started on."""
    claims = await google_oauth.authorize(google, request)
    raw_token = await service.start_session(
        db,
        claims,
        previous_token=session_token,
        user_agent=request.headers.get("user-agent", ""),
        ip_address=request.client.host if request.client else "",
    )

    response = _frontend_redirect(
        settings, request.session.pop(RETURN_PATH_SESSION_KEY, None)
    )
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
