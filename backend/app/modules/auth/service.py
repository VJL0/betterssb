from __future__ import annotations

import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_token
from app.modules.auth import repository as auth_repo
from app.modules.auth.models import User

SESSION_IDLE_TIMEOUT = timedelta(days=7)
SESSION_ABSOLUTE_TIMEOUT = timedelta(days=30)
# Refresh `last_seen_at` at most this often, so most requests don't write.
SESSION_TOUCH_INTERVAL = timedelta(minutes=5)


class InactiveUserError(Exception):
    """The user for this Google account is deactivated."""


class AuthService:
    async def start_session(
        self,
        db: AsyncSession,
        google_claims: dict,
        *,
        previous_token: str | None = None,
        user_agent: str = "",
        ip_address: str = "",
    ) -> str:
        """Upsert the user, start a session, and return its raw token.

        Deletes the browser's previous session, so each sign-in gets a new token.

        Raises:
            InactiveUserError: The user is deactivated.
        """
        if previous_token:
            await auth_repo.delete_session(db, hash_token(previous_token))

        user = await auth_repo.upsert_user(db, google_claims)
        if not user.is_active:
            raise InactiveUserError(str(user.id))

        raw_token = secrets.token_urlsafe(32)
        now = datetime.now(UTC)
        await auth_repo.create_session(
            db,
            user_id=user.id,
            token_hash=hash_token(raw_token),
            last_seen_at=now,
            expires_at=now + SESSION_ABSOLUTE_TIMEOUT,
            user_agent=user_agent,
            ip_address=ip_address,
        )
        return raw_token

    async def get_session_user(self, db: AsyncSession, raw_token: str) -> User | None:
        """Return the session's user, or None if the session is invalid or timed out."""
        now = datetime.now(UTC)
        return await auth_repo.get_session_user(
            db,
            hash_token(raw_token),
            now=now,
            idle_since=now - SESSION_IDLE_TIMEOUT,
            touch_before=now - SESSION_TOUCH_INTERVAL,
        )

    async def end_session(self, db: AsyncSession, raw_token: str) -> None:
        await auth_repo.delete_session(db, hash_token(raw_token))
