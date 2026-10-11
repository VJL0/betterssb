from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.auth.models import User, UserSession


async def get_user_by_google_sub(db: AsyncSession, google_sub: str) -> User | None:
    stmt = select(User).where(User.google_sub == google_sub)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def upsert_user(db: AsyncSession, claims: dict) -> User:
    google_sub = claims["sub"]
    user = await get_user_by_google_sub(db, google_sub)

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


async def create_session(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    token_hash: str,
    last_seen_at: datetime,
    expires_at: datetime,
    user_agent: str = "",
    ip_address: str = "",
) -> UserSession:
    session = UserSession(
        user_id=user_id,
        token_hash=token_hash,
        last_seen_at=last_seen_at,
        expires_at=expires_at,
        user_agent=user_agent,
        ip_address=ip_address,
    )
    db.add(session)
    await db.commit()
    return session


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
        await db.commit()
    return user


async def delete_session(db: AsyncSession, token_hash: str) -> None:
    await db.execute(delete(UserSession).where(UserSession.token_hash == token_hash))
    await db.commit()
