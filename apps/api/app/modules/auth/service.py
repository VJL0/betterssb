from __future__ import annotations

import logging
import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_token
from app.modules.auth import repository as auth_repo
from app.modules.auth.errors import SignInError
from app.modules.auth.models import User, UserSession

logger = logging.getLogger(__name__)

# NIST SP 800-63B-4 (AAL1): reauthenticate at least every 30 days; an
# inactivity timeout is optional.
SESSION_IDLE_TIMEOUT = timedelta(days=7)
SESSION_ABSOLUTE_TIMEOUT = timedelta(days=30)
# Refresh `last_seen_at` at most this often, so most requests don't write.
SESSION_TOUCH_INTERVAL = timedelta(minutes=5)


async def start_session(
    db: AsyncSession,
    google_claims: dict,
    *,
    previous_token: str | None = None,
    user_agent: str = "",
    ip_address: str = "",
) -> str:
    """Upsert the user, start a session, and return its raw token.

    Replaces the browser's previous session, so each sign-in gets a new token.

    Raises:
        SignInError: The user is deactivated. Nothing is committed.
    """
    now = datetime.now(UTC)
    user = await auth_repo.upsert_user(db, google_claims, now=now)
    if not user.is_active:
        raise SignInError("account_disabled", f"user {user.id} is deactivated")

    if previous_token:
        await auth_repo.delete_session(db, hash_token(previous_token))

    raw_token = secrets.token_urlsafe(32)
    db.add(
        UserSession(
            user_id=user.id,
            token_hash=hash_token(raw_token),
            last_seen_at=now,
            expires_at=now + SESSION_ABSOLUTE_TIMEOUT,
            user_agent=user_agent,
            ip_address=ip_address,
        )
    )
    await db.commit()
    logger.info("authn_login_success:%s", user.id)
    return raw_token


async def get_session_user(db: AsyncSession, raw_token: str) -> User | None:
    """Return the session's user, or None if the session is invalid or timed out."""
    now = datetime.now(UTC)
    user = await auth_repo.get_session_user(
        db,
        hash_token(raw_token),
        now=now,
        idle_since=now - SESSION_IDLE_TIMEOUT,
        touch_before=now - SESSION_TOUCH_INTERVAL,
    )
    # Saves the `last_seen_at` refresh, if there was one.
    await db.commit()
    return user


async def end_session(db: AsyncSession, raw_token: str) -> None:
    await auth_repo.delete_session(db, hash_token(raw_token))
    await db.commit()
