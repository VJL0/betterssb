"""Read-only client for Temple University's public Bulletin (bulletin.temple.edu)."""

from __future__ import annotations

import asyncio
import logging
from urllib.parse import urlsplit

import httpx

from app.modules.degree.bulletin_html import BULLETIN_BASE

logger = logging.getLogger(__name__)

REQUEST_TIMEOUT_SECONDS = 15.0
USER_AGENT = "BetterSSB/0.1 (read-only Bulletin lookup)"
# The Bulletin is Temple's public site; cap what one API process sends it.
MAX_CONCURRENT_REQUESTS = 3

_bulletin_slots = asyncio.Semaphore(MAX_CONCURRENT_REQUESTS)


class BulletinUnavailable(Exception):
    """The Bulletin didn't answer, or answered with an error."""


class BulletinPageNotFound(Exception):
    """The Bulletin has no page at that path, such as a year that isn't archived."""


class BulletinClient:
    def __init__(
        self,
        base_url: str = BULLETIN_BASE,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._host = urlsplit(self._base_url).hostname
        self._transport = transport

    async def _stay_on_bulletin(self, request: httpx.Request) -> None:
        if request.url.host != self._host:
            raise BulletinUnavailable(f"Bulletin redirected off-site to {request.url}")

    async def get_page(self, path: str) -> str:
        """The HTML at `path` on the Bulletin, following redirects only on its own host."""
        async with (
            _bulletin_slots,
            httpx.AsyncClient(
                base_url=self._base_url,
                timeout=REQUEST_TIMEOUT_SECONDS,
                transport=self._transport,
                headers={"User-Agent": USER_AGENT},
                follow_redirects=True,
                event_hooks={"request": [self._stay_on_bulletin]},
            ) as session,
        ):
            try:
                response = await session.get(path)
            except httpx.HTTPError as exc:
                logger.warning("Bulletin %s failed: %s", path, exc)
                raise BulletinUnavailable from exc
        if response.status_code == httpx.codes.NOT_FOUND:
            raise BulletinPageNotFound(path)
        if response.status_code != httpx.codes.OK:
            logger.warning("Bulletin %s returned %s", path, response.status_code)
            raise BulletinUnavailable(f"Bulletin returned {response.status_code}")
        return response.text
