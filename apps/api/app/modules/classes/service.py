from __future__ import annotations

import hashlib
import html
import json
import logging
from dataclasses import asdict
from datetime import UTC, datetime
from typing import Any, Protocol

from pydantic import TypeAdapter

from app.modules.classes.client import BannerClassSearchClient, SearchFilters
from app.modules.classes.schemas import ClassSearchResult, CodeDescription

logger = logging.getLogger(__name__)

# Seats change by the minute during registration; lookups change by the term.
SEARCH_TTL_SECONDS = 60
LOOKUP_TTL_SECONDS = 24 * 60 * 60
MAX_TERMS = 10
CACHE_PREFIX = "classes:"

_code_descriptions = TypeAdapter(list[CodeDescription])


class Cache(Protocol):
    """The subset of `redis.asyncio.Redis` the service uses."""

    async def get(self, name: str) -> bytes | str | None: ...

    async def set(self, name: str, value: str, ex: int) -> Any: ...


def _unescape(value: Any) -> Any:
    """Banner HTML-escapes text ("Computer &amp; Information Science")."""
    if isinstance(value, str):
        return html.unescape(value)
    if isinstance(value, list):
        return [_unescape(v) for v in value]
    if isinstance(value, dict):
        return {k: _unescape(v) for k, v in value.items()}
    return value


def _search_key(filters: SearchFilters) -> str:
    digest = hashlib.sha256(
        json.dumps(asdict(filters), sort_keys=True).encode()
    ).hexdigest()
    return f"{CACHE_PREFIX}search:{digest}"


class ClassSearchService:
    """Banner's public class search, cached so repeat searches don't reach Banner."""

    def __init__(self, client: BannerClassSearchClient, cache: Cache | None) -> None:
        self._client = client
        self._cache = cache

    async def terms(self) -> list[CodeDescription]:
        return await self._lookup(
            f"{CACHE_PREFIX}terms", lambda: self._client.get_terms(MAX_TERMS)
        )

    async def subjects(self, term: str, query: str = "") -> list[CodeDescription]:
        query = query.strip().upper()
        return await self._lookup(
            f"{CACHE_PREFIX}subjects:{term}:{query}",
            lambda: self._client.get_subjects(term, query),
        )

    async def attributes(self, term: str) -> list[CodeDescription]:
        return await self._lookup(
            f"{CACHE_PREFIX}attributes:{term}",
            lambda: self._client.get_attributes(term),
        )

    async def search(self, filters: SearchFilters) -> ClassSearchResult:
        key = _search_key(filters)
        if cached := await self._get(key):
            return ClassSearchResult.model_validate_json(cached)
        body = _unescape(await self._client.search(filters))
        result = ClassSearchResult(
            total_count=body.get("totalCount") or 0,
            sections=body.get("data") or [],
            fetched_at=datetime.now(UTC),
        )
        await self._set(key, result.model_dump_json(by_alias=True), SEARCH_TTL_SECONDS)
        return result

    async def _lookup(self, key: str, fetch) -> list[CodeDescription]:
        if cached := await self._get(key):
            return _code_descriptions.validate_json(cached)
        items = _code_descriptions.validate_python(_unescape(await fetch()))
        await self._set(
            key, _code_descriptions.dump_json(items).decode(), LOOKUP_TTL_SECONDS
        )
        return items

    # A cache outage only costs speed: searches still go to Banner.
    async def _get(self, key: str) -> bytes | str | None:
        if not self._cache:
            return None
        try:
            return await self._cache.get(key)
        except Exception:
            logger.warning("Class search cache read failed", exc_info=True)
            return None

    async def _set(self, key: str, value: str, ttl: int) -> None:
        if not self._cache:
            return
        try:
            await self._cache.set(key, value, ex=ttl)
        except Exception:
            logger.warning("Class search cache write failed", exc_info=True)
