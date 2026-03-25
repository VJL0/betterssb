from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime, timedelta

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.security import (
    create_access_token,
    generate_refresh_token,
    hash_token,
)
from app.models.user import RefreshToken, User

logger = logging.getLogger(__name__)

GOOGLE_TOKEN_INFO_URL = "https://oauth2.googleapis.com/tokeninfo"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"


class AuthService:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    async def verify_google_token(self, credential: str) -> dict:
        """Verify a Google ID token (from Sign In With Google) and return claims."""
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                GOOGLE_TOKEN_INFO_URL,
                params={"id_token": credential},
            )
            resp.raise_for_status()
            claims = resp.json()

        aud = claims.get("aud", "")
        if aud != self._settings.GOOGLE_CLIENT_ID:
            raise ValueError(f"Token audience mismatch: {aud}")

        return claims

    async def authenticate(
        self,
        db: AsyncSession,
        google_claims: dict,
        *,
        device_info: str = "",
        ip_address: str = "",
    ) -> tuple[str, str, User]:
        """Upsert the user and return (access_token, refresh_token, user)."""
        user = await self._upsert_user(db, google_claims)

        access_token = create_access_token(user.id, self._settings)
        raw_refresh, refresh_hash = generate_refresh_token()

        rt = RefreshToken(
            user_id=user.id,
            token_hash=refresh_hash,
            expires_at=datetime.now(UTC) + timedelta(days=self._settings.REFRESH_TOKEN_EXPIRE_DAYS),
            device_info=device_info,
            ip_address=ip_address,
        )
        db.add(rt)
        await db.commit()

        return access_token, raw_refresh, user

    async def refresh_tokens(
        self,
        db: AsyncSession,
        raw_refresh: str,
        *,
        device_info: str = "",
        ip_address: str = "",
    ) -> tuple[str, str, User]:
        """Rotate a refresh token pair. Old token is revoked."""
        token_hash = hash_token(raw_refresh)

        stmt = select(RefreshToken).where(
            RefreshToken.token_hash == token_hash,
            RefreshToken.revoked.is_(False),
            RefreshToken.expires_at > datetime.now(UTC),
        )
        result = await db.execute(stmt)
        old_rt = result.scalar_one_or_none()
        if old_rt is None:
            raise ValueError("Invalid or expired refresh token")

        old_rt.revoked = True

        user = await db.get(User, old_rt.user_id)
        if user is None or not user.is_active:
            raise ValueError("User not found or inactive")

        access_token = create_access_token(user.id, self._settings)
        new_raw, new_hash = generate_refresh_token()

        new_rt = RefreshToken(
            user_id=user.id,
            token_hash=new_hash,
            expires_at=datetime.now(UTC) + timedelta(days=self._settings.REFRESH_TOKEN_EXPIRE_DAYS),
            device_info=device_info,
            ip_address=ip_address,
        )
        db.add(new_rt)
        await db.commit()

        return access_token, new_raw, user

    async def revoke_refresh_token(self, db: AsyncSession, raw_refresh: str) -> None:
        token_hash = hash_token(raw_refresh)
        stmt = select(RefreshToken).where(RefreshToken.token_hash == token_hash)
        result = await db.execute(stmt)
        rt = result.scalar_one_or_none()
        if rt:
            rt.revoked = True
            await db.commit()

    async def get_user_by_id(self, db: AsyncSession, user_id: uuid.UUID) -> User | None:
        return await db.get(User, user_id)

    async def _upsert_user(self, db: AsyncSession, claims: dict) -> User:
        google_sub = claims["sub"]
        stmt = select(User).where(User.google_sub == google_sub)
        result = await db.execute(stmt)
        user = result.scalar_one_or_none()

        now = datetime.now(UTC)
        if user is None:
            user = User(
                email=claims.get("email", ""),
                name=claims.get("name", ""),
                picture_url=claims.get("picture", ""),
                google_sub=google_sub,
                last_login_at=now,
            )
            db.add(user)
        else:
            user.name = claims.get("name", user.name)
            user.picture_url = claims.get("picture", user.picture_url)
            user.email = claims.get("email", user.email)
            user.last_login_at = now

        await db.commit()
        await db.refresh(user)
        return user
