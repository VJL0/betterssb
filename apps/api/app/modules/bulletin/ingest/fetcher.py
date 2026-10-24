"""Polite HTTP fetching: one request at a time per host, spaced out, retried
with backoff, conditional when we already hold a copy.

Agent parallelism and fetch concurrency are separate concerns: however many
parsers or reviewers run, each host only ever sees one request in flight and
at most one per `min_interval` seconds.

Redirects are followed by hand so every hop is checked against robots.txt and
the catalog's scope before it's requested.
"""

from __future__ import annotations

import asyncio
import email.utils
import random
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from urllib.parse import urljoin, urlsplit

import httpx

USER_AGENT = "BetterSSB-Bulletin-Ingest/2.0 (+https://github.com/VJL0/betterssb)"
REQUEST_TIMEOUT_SECONDS = 30.0
DEFAULT_MIN_INTERVAL_SECONDS = 1.0
MAX_ATTEMPTS = 4
BACKOFF_BASE_SECONDS = 2.0
MAX_BACKOFF_SECONDS = 60.0
MAX_REDIRECTS = 5
# The largest full-volume PDF is about 35 MB; anything far past that is a mistake.
MAX_BODY_BYTES = 80 * 1024 * 1024
RETRY_STATUSES = frozenset({429, 500, 502, 503, 504})
REDIRECT_STATUSES = frozenset({301, 302, 303, 307, 308})
HTTP_NOT_MODIFIED = 304


@dataclass(slots=True)
class FetchResult:
    url: str
    status: int | None
    final_url: str
    redirect_chain: list[str] = field(default_factory=list)
    headers: dict[str, str] = field(default_factory=dict)
    body: bytes | None = None
    error: str | None = None
    elapsed_ms: int = 0
    conditional: bool = False

    @property
    def not_modified(self) -> bool:
        return self.status == HTTP_NOT_MODIFIED

    @property
    def content_type(self) -> str:
        return self.headers.get("content-type", "")


class BlockedRedirectError(Exception):
    """A redirect pointed somewhere the ingester may not go."""


class HostPacer:
    """Serializes requests to one host and spaces them `min_interval` apart."""

    def __init__(self, min_interval: float) -> None:
        self.min_interval = min_interval
        self.lock = asyncio.Lock()
        self.last_request_at = 0.0

    async def __aenter__(self) -> None:
        await self.lock.acquire()
        wait = self.last_request_at + self.min_interval - time.monotonic()
        if wait > 0:
            await asyncio.sleep(wait)

    async def __aexit__(self, *exc_info: object) -> None:
        self.last_request_at = time.monotonic()
        self.lock.release()


def retry_after_seconds(value: str | None) -> float | None:
    """A Retry-After header as seconds: either delta-seconds or an HTTP date."""
    if not value:
        return None
    if value.strip().isdigit():
        return float(value)
    try:
        when = email.utils.parsedate_to_datetime(value)
    except TypeError, ValueError:
        return None
    return max(0.0, (when - datetime.now(UTC)).total_seconds())


def backoff_seconds(attempt: int) -> float:
    """Exponential backoff with full jitter."""
    ceiling = min(MAX_BACKOFF_SECONDS, BACKOFF_BASE_SECONDS * 2**attempt)
    return random.uniform(ceiling / 2, ceiling)


class PoliteFetcher:
    def __init__(
        self,
        client: httpx.AsyncClient,
        min_interval: float = DEFAULT_MIN_INTERVAL_SECONDS,
        host_intervals: dict[str, float] | None = None,
    ) -> None:
        self.client = client
        self.min_interval = min_interval
        self.host_intervals = host_intervals or {}
        self.pacers: dict[str, HostPacer] = {}

    def pacer(self, host: str) -> HostPacer:
        if host not in self.pacers:
            interval = self.host_intervals.get(host, self.min_interval)
            self.pacers[host] = HostPacer(interval)
        return self.pacers[host]

    async def fetch(
        self,
        url: str,
        may_fetch: Callable[[str], bool],
        etag: str | None = None,
        last_modified: str | None = None,
    ) -> FetchResult:
        """GET `url`, following redirects that `may_fetch` allows."""
        conditional_headers = {}
        if etag:
            conditional_headers["If-None-Match"] = etag
        if last_modified:
            conditional_headers["If-Modified-Since"] = last_modified
        chain: list[str] = []
        current = url
        started = time.monotonic()
        for _ in range(MAX_REDIRECTS + 1):
            # Validators belong to the URL we hold a copy of, not a redirect target.
            headers = conditional_headers if current == url else {}
            result = await self._get_with_retries(current, headers)
            result.url = url
            result.redirect_chain = chain
            result.conditional = bool(conditional_headers)
            if result.status not in REDIRECT_STATUSES:
                result.elapsed_ms = int((time.monotonic() - started) * 1000)
                return result
            location = result.headers.get("location")
            if not location:
                result.error = "redirect without Location"
                return result
            target = urljoin(current, location)
            if not may_fetch(target):
                result.error = f"redirect to disallowed URL {target}"
                result.status = None
                return result
            chain.append(current)
            current = target
        return FetchResult(url, None, current, chain, error="too many redirects")

    async def _get_with_retries(self, url: str, headers: dict[str, str]) -> FetchResult:
        host = urlsplit(url).hostname or ""
        last_error = ""
        for attempt in range(MAX_ATTEMPTS):
            async with self.pacer(host):
                try:
                    result = await self._get(url, headers)
                except httpx.HTTPError as exc:
                    last_error = f"{type(exc).__name__}: {exc}"
                    result = None
            if result is not None and result.status not in RETRY_STATUSES:
                return result
            if attempt + 1 == MAX_ATTEMPTS:
                break
            delay = backoff_seconds(attempt)
            if result is not None:
                last_error = f"HTTP {result.status}"
                delay = retry_after_seconds(result.headers.get("retry-after")) or delay
            await asyncio.sleep(min(delay, MAX_BACKOFF_SECONDS))
        if result is not None:
            result.error = last_error
            return result
        return FetchResult(url, None, url, error=last_error)

    async def _get(self, url: str, headers: dict[str, str]) -> FetchResult:
        async with self.client.stream("GET", url, headers=headers) as response:
            body = bytearray()
            async for chunk in response.aiter_bytes():
                body.extend(chunk)
                if len(body) > MAX_BODY_BYTES:
                    return FetchResult(
                        url,
                        response.status_code,
                        str(response.url),
                        headers=dict(response.headers),
                        error=f"body larger than {MAX_BODY_BYTES} bytes",
                    )
            return FetchResult(
                url,
                response.status_code,
                str(response.url),
                headers={k.lower(): v for k, v in response.headers.items()},
                body=bytes(body),
            )


def new_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        headers={"User-Agent": USER_AGENT},
        timeout=REQUEST_TIMEOUT_SECONDS,
        follow_redirects=False,
    )
