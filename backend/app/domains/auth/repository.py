from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domains.auth.models import RefreshToken, User


async def get_user_by_id(db: AsyncSession, user_id: uuid.UUID) -> User | None:
    return await db.get(User, user_id)


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


async def create_refresh_token(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    token_hash: str,
    expires_at: datetime,
    device_info: str = "",
    ip_address: str = "",
) -> RefreshToken:
    rt = RefreshToken(
        user_id=user_id,
        token_hash=token_hash,
        expires_at=expires_at,
        device_info=device_info,
        ip_address=ip_address,
    )
    db.add(rt)
    await db.commit()
    return rt


async def get_valid_refresh_token(db: AsyncSession, token_hash: str) -> RefreshToken | None:
    stmt = select(RefreshToken).where(
        RefreshToken.token_hash == token_hash,
        RefreshToken.revoked.is_(False),
        RefreshToken.expires_at > datetime.now(UTC),
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def revoke_refresh_token(db: AsyncSession, token_hash: str) -> None:
    stmt = select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    result = await db.execute(stmt)
    rt = result.scalar_one_or_none()
    if rt:
        rt.revoked = True
        await db.commit()
