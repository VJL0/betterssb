from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.domains.auth.dependencies import get_auth_service, get_current_user
from app.domains.auth.models import User
from app.domains.auth.schemas import (
    GoogleLoginRequest,
    RefreshRequest,
    TokenResponse,
    UserResponse,
)
from app.domains.auth.service import AuthService

router = APIRouter(prefix="/auth", tags=["auth"])


def _user_response(user: User) -> UserResponse:
    return UserResponse(
        id=str(user.id),
        email=user.email,
        name=user.name,
        picture_url=user.picture_url,
    )


@router.post("/google", response_model=TokenResponse)
async def google_login(
    body: GoogleLoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    service: AuthService = Depends(get_auth_service),
) -> TokenResponse:
    """Exchange a Google ID token for access + refresh tokens."""
    try:
        claims = await service.verify_google_token(body.credential)
    except Exception as exc:
        raise HTTPException(status_code=401, detail=f"Invalid Google token: {exc}") from None

    access, refresh, user = await service.authenticate(
        db,
        claims,
        device_info=request.headers.get("user-agent", ""),
        ip_address=request.client.host if request.client else "",
    )

    return TokenResponse(
        access_token=access,
        refresh_token=refresh,
        user=_user_response(user),
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_tokens(
    body: RefreshRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    service: AuthService = Depends(get_auth_service),
) -> TokenResponse:
    """Rotate a refresh token pair."""
    try:
        access, refresh, user = await service.refresh_tokens(
            db,
            body.refresh_token,
            device_info=request.headers.get("user-agent", ""),
            ip_address=request.client.host if request.client else "",
        )
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from None

    return TokenResponse(
        access_token=access,
        refresh_token=refresh,
        user=_user_response(user),
    )


@router.post("/logout")
async def logout(
    body: RefreshRequest,
    db: AsyncSession = Depends(get_db),
    service: AuthService = Depends(get_auth_service),
) -> dict[str, str]:
    """Revoke a refresh token."""
    await service.revoke_refresh_token(db, body.refresh_token)
    return {"status": "ok"}


@router.get("/me", response_model=UserResponse)
async def get_me(user: User = Depends(get_current_user)) -> UserResponse:
    """Get the current authenticated user."""
    return _user_response(user)
