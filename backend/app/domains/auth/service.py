from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.security import generate_session_token, hash_token
from app.domains.auth import repository as auth_repo
from app.domains.auth.models import User

logger = logging.getLogger(__name__)

# Refresh `last_seen_at` at most this often, so most requests don't write.
SESSION_TOUCH_INTERVAL = timedelta(minutes=5)


class InactiveUserError(Exception):
    """The user for this Google account is deactivated."""


class AuthService:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    async def start_session(
        self,
        db: AsyncSession,
        google_claims: dict,
        *,
        previous_token: str | None = None,
        user_agent: str = "",
        ip_address: str = "",
    ) -> tuple[str, User]:
        """Upsert the user, start a session, and return (raw_token, user).

        Deletes the browser's previous session, so each sign-in gets a new token.

        Raises:
            InactiveUserError: The user is deactivated.
        """
        if previous_token:
            await auth_repo.delete_session(db, hash_token(previous_token))

        user = await auth_repo.upsert_user(db, google_claims)
        if not user.is_active:
            raise InactiveUserError(str(user.id))

        raw_token, token_hash = generate_session_token()
        now = datetime.now(UTC)
        await auth_repo.create_session(
            db,
            user_id=user.id,
            token_hash=token_hash,
            last_seen_at=now,
            expires_at=now + timedelta(days=self._settings.SESSION_ABSOLUTE_TIMEOUT_DAYS),
            user_agent=user_agent,
            ip_address=ip_address,
        )
        return raw_token, user

    async def get_session_user(self, db: AsyncSession, raw_token: str) -> User | None:
        """Return the session's user, or None if the session is invalid or timed out."""
        now = datetime.now(UTC)
        return await auth_repo.get_session_user(
            db,
            hash_token(raw_token),
            now=now,
            idle_since=now - timedelta(days=self._settings.SESSION_IDLE_TIMEOUT_DAYS),
            touch_before=now - SESSION_TOUCH_INTERVAL,
        )

    async def end_session(self, db: AsyncSession, raw_token: str) -> None:
        await auth_repo.delete_session(db, hash_token(raw_token))
