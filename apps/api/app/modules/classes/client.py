"""Read-only client for Banner's public class search (no student login).

Banner keeps the selected term and the last search in the HTTP session, so
each search uses a fresh client: a reused session returns the previous
search's results regardless of the new filters.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from typing import Any

import httpx

logger = logging.getLogger(__name__)

TEMPLE_SSB_BASE_URL = "https://prd-xereg.temple.edu/StudentRegistrationSsb/ssb"
REQUEST_TIMEOUT_SECONDS = 15.0
USER_AGENT = "BetterSSB/0.1 (read-only class search)"
# Banner is shared with every student at Temple; cap what one API process sends it.
MAX_CONCURRENT_REQUESTS = 5
LOOKUP_PAGE_SIZE = 500

_banner_slots = asyncio.Semaphore(MAX_CONCURRENT_REQUESTS)


class ClassSearchUnavailable(Exception):
    """Banner didn't answer, or answered with something other than search data."""


@dataclass(frozen=True)
class SearchFilters:
    term: str
    subject: str = ""
    course_number: str = ""
    keyword: str = ""
    attribute: str = ""
    offset: int = 0
    limit: int = 50

    def as_params(self) -> dict[str, str]:
        return {
            "txt_term": self.term,
            "txt_subject": self.subject,
            "txt_courseNumber": self.course_number,
            "txt_keywordlike": self.keyword,
            "txt_attribute": self.attribute,
            "startDatepicker": "",
            "endDatepicker": "",
            "pageOffset": str(self.offset),
            "pageMaxSize": str(self.limit),
            "sortColumn": "subjectDescription",
            "sortDirection": "asc",
        }


class BannerClassSearchClient:
    def __init__(
        self, base_url: str, *, transport: httpx.AsyncBaseTransport | None = None
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._transport = transport

    def _session(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            base_url=self._base_url,
            timeout=REQUEST_TIMEOUT_SECONDS,
            transport=self._transport,
            headers={"User-Agent": USER_AGENT, "X-Requested-With": "XMLHttpRequest"},
        )

    async def get_terms(self, max_terms: int) -> list[dict[str, Any]]:
        params = {"searchTerm": "", "offset": "1", "max": str(max_terms)}
        return _expect_list(await self._get("/classSearch/getTerms", params))

    async def get_subjects(self, term: str, query: str = "") -> list[dict[str, Any]]:
        params = {
            "searchTerm": query,
            "term": term,
            "offset": "1",
            "max": str(LOOKUP_PAGE_SIZE),
        }
        return _expect_list(await self._get("/classSearch/get_subject", params))

    async def get_attributes(self, term: str) -> list[dict[str, Any]]:
        params = {
            "searchTerm": "",
            "term": term,
            "offset": "1",
            "max": str(LOOKUP_PAGE_SIZE),
        }
        return _expect_list(await self._get("/classSearch/get_attribute", params))

    async def search(self, filters: SearchFilters) -> dict[str, Any]:
        async with _banner_slots, self._session() as session:
            try:
                selected = await session.post(
                    "/term/search",
                    params={"mode": "search"},
                    data={"term": filters.term},
                )
                selected.raise_for_status()
                response = await session.get(
                    "/searchResults/searchResults", params=filters.as_params()
                )
                response.raise_for_status()
                body = response.json()
            except (httpx.HTTPError, ValueError) as exc:
                logger.warning("Banner class search failed: %s", exc)
                raise ClassSearchUnavailable from exc
        if not isinstance(body, dict) or body.get("success") is not True:
            raise ClassSearchUnavailable(
                "Banner returned an unexpected search response"
            )
        return body

    async def _get(self, path: str, params: dict[str, str]) -> Any:
        async with _banner_slots, self._session() as session:
            try:
                response = await session.get(path, params=params)
                response.raise_for_status()
                return response.json()
            except (httpx.HTTPError, ValueError) as exc:
                logger.warning("Banner %s failed: %s", path, exc)
                raise ClassSearchUnavailable from exc


def _expect_list(body: Any) -> list[dict[str, Any]]:
    if not isinstance(body, list):
        raise ClassSearchUnavailable("Banner returned an unexpected lookup response")
    return body
