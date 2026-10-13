from __future__ import annotations

from datetime import datetime

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.models import User, UserSession


async def upsert_user(db: AsyncSession, claims: dict, *, now: datetime) -> User:
    google_sub = claims["sub"]
    user = await db.scalar(select(User).where(User.google_sub == google_sub))

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

    await db.flush()
    return user


async def get_session_user(
    db: AsyncSession,
    token_hash: str,
    *,
    now: datetime,
    idle_since: datetime,
    touch_before: datetime,
) -> User | None:
    """Return the session's user, or None if the session is unknown, expired, or idle.

    Updates `last_seen_at` only once it's older than `touch_before`, so most
    requests don't write.
    """
    stale = UserSession.last_seen_at < touch_before
    stmt = (
        select(User, UserSession.id, stale)
        .join(UserSession.user)
        .where(
            UserSession.token_hash == token_hash,
            UserSession.expires_at > now,
            UserSession.last_seen_at > idle_since,
            User.is_active.is_(True),
        )
    )
    row = (await db.execute(stmt)).one_or_none()
    if row is None:
        return None

    user, session_id, is_stale = row
    if is_stale:
        await db.execute(
            update(UserSession)
            .where(UserSession.id == session_id)
            .values(last_seen_at=now)
        )
    return user


async def delete_session(db: AsyncSession, token_hash: str) -> None:
    await db.execute(delete(UserSession).where(UserSession.token_hash == token_hash))
