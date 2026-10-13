from __future__ import annotations

from typing import Annotated

from authlib.integrations.starlette_client import StarletteOAuth2App
from fastapi import Depends, Request
from fastapi.security import APIKeyCookie

from app.api.deps import DbDep
from app.modules.auth import service
from app.modules.auth.models import User

# `__Host-Http-` makes the browser require Secure, HttpOnly, Path=/, and no Domain,
# and refuse the cookie from other subdomains or JavaScript. Chrome treats
# http://localhost as secure.
SESSION_COOKIE = "__Host-Http-sid"
# Shared by set and delete; browsers ignore a delete whose attributes don't match.
SESSION_COOKIE_ATTRS = {
    "path": "/",
    "secure": True,
    "httponly": True,
    "samesite": "lax",
}
# Optional, because sign-in and logout run without a session. Also documents the
# cookie in OpenAPI.
session_cookie = APIKeyCookie(name=SESSION_COOKIE, auto_error=False)


def get_google_client(request: Request) -> StarletteOAuth2App:
    return request.app.state.google


GoogleClientDep = Annotated[StarletteOAuth2App, Depends(get_google_client)]
SessionTokenDep = Annotated[str | None, Depends(session_cookie)]


async def get_current_user(token: SessionTokenDep, db: DbDep) -> User:
    user = await service.get_session_user(db, token) if token else None
    if user is None:
        # 401 with the `WWW-Authenticate` challenge RFC 9110 requires.
        raise session_cookie.make_not_authenticated_error()
    return user


CurrentUserDep = Annotated[User, Depends(get_current_user)]
