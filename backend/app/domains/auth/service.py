from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.security import create_access_token, generate_refresh_token, hash_token
from app.domains.auth import repository as auth_repo
from app.domains.auth.models import User
from app.integrations.google.client import GoogleAuthClient

logger = logging.getLogger(__name__)


class AuthService:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._google = GoogleAuthClient(settings.GOOGLE_CLIENT_ID)

    async def verify_google_token(self, credential: str) -> dict:
        """Verify a Google ID token (from Sign In With Google) and return claims."""
        return await self._google.verify_id_token(credential)

    async def authenticate(
        self,
        db: AsyncSession,
        google_claims: dict,
        *,
        device_info: str = "",
        ip_address: str = "",
    ) -> tuple[str, str, User]:
        """Upsert the user and return (access_token, refresh_token, user)."""
        user = await auth_repo.upsert_user(db, google_claims)

        access_token = create_access_token(user.id, self._settings)
        raw_refresh, refresh_hash = generate_refresh_token()

        await auth_repo.create_refresh_token(
            db,
            user_id=user.id,
            token_hash=refresh_hash,
            expires_at=datetime.now(UTC) + timedelta(days=self._settings.REFRESH_TOKEN_EXPIRE_DAYS),
            device_info=device_info,
            ip_address=ip_address,
        )

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

        old_rt = await auth_repo.get_valid_refresh_token(db, token_hash)
        if old_rt is None:
            raise ValueError("Invalid or expired refresh token")

        old_rt.revoked = True

        user = await db.get(User, old_rt.user_id)
        if user is None or not user.is_active:
            raise ValueError("User not found or inactive")

        access_token = create_access_token(user.id, self._settings)
        new_raw, new_hash = generate_refresh_token()

        await auth_repo.create_refresh_token(
            db,
            user_id=user.id,
            token_hash=new_hash,
            expires_at=datetime.now(UTC) + timedelta(days=self._settings.REFRESH_TOKEN_EXPIRE_DAYS),
            device_info=device_info,
            ip_address=ip_address,
        )

        return access_token, new_raw, user

    async def revoke_refresh_token(self, db: AsyncSession, raw_refresh: str) -> None:
        await auth_repo.revoke_refresh_token(db, hash_token(raw_refresh))

    async def get_user_by_id(self, db: AsyncSession, user_id: uuid.UUID) -> User | None:
        return await auth_repo.get_user_by_id(db, user_id)
