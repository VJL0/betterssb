from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException, Request, status

from app.api.deps import DbDep
from app.domains.auth.models import User
from app.domains.auth.service import AuthService
from app.integrations.google.client import GoogleOAuthClient

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


def get_google_client(request: Request) -> GoogleOAuthClient:
    return request.app.state.google


def get_session_token(request: Request) -> str | None:
    return request.cookies.get(SESSION_COOKIE)


AuthServiceDep = Annotated[AuthService, Depends()]
GoogleClientDep = Annotated[GoogleOAuthClient, Depends(get_google_client)]
SessionTokenDep = Annotated[str | None, Depends(get_session_token)]


async def get_current_user(
    token: SessionTokenDep, db: DbDep, service: AuthServiceDep
) -> User:
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated"
        )

    user = await service.get_session_user(db, token)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired"
        )

    return user


CurrentUserDep = Annotated[User, Depends(get_current_user)]
