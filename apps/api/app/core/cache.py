from __future__ import annotations

import logging
from typing import Any, Protocol

from fastapi import Request

logger = logging.getLogger(__name__)

ONE_DAY_SECONDS = 24 * 60 * 60


class Cache(Protocol):
    """The subset of `redis.asyncio.Redis` the services use."""

    async def get(self, name: str) -> bytes | str | None: ...

    async def set(self, name: str, value: str, ex: int, nx: bool = False) -> Any: ...


def get_cache(request: Request) -> Cache | None:
    # Unset when the app runs without its lifespan (tests); lookups then go uncached.
    return getattr(request.app.state, "redis", None)


# A cache outage only costs speed: lookups still go to the upstream service.
async def cache_get(cache: Cache | None, key: str) -> bytes | str | None:
    if not cache:
        return None
    try:
        return await cache.get(key)
    except Exception:
        logger.warning("Cache read failed for %s", key, exc_info=True)
        return None


async def cache_set(cache: Cache | None, key: str, value: str, ttl: int) -> None:
    if not cache:
        return
    try:
        await cache.set(key, value, ex=ttl)
    except Exception:
        logger.warning("Cache write failed for %s", key, exc_info=True)


async def cache_claim(cache: Cache | None, key: str, ttl: int) -> bool:
    """Set `key` only if it's missing, so one process of several does a job.

    Without a cache there's one process, which always gets it.
    """
    if not cache:
        return True
    try:
        return bool(await cache.set(key, "1", ex=ttl, nx=True))
    except Exception:
        logger.warning("Cache claim failed for %s", key, exc_info=True)
        return False
