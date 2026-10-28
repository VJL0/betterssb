"""Read-only client for Banner's public class search (no student login).

Banner keeps the selected term and the last search in the HTTP session, so
each search uses a fresh client: a reused session returns the previous
search's results regardless of the new filters.
"""

from __future__ import annotations

import asyncio
import logging
import re
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
# Banner compares course numbers as text, so range ends must be four digits.
COURSE_NUMBER_DIGITS = 4
HIGHEST_COURSE_NUMBER = "9999"
# Common surnames ("Smith") match dozens of instructors; past this many, the
# search URL gets long without narrowing anything a student would want.
MAX_INSTRUCTOR_MATCHES = 50

_banner_slots = asyncio.Semaphore(MAX_CONCURRENT_REQUESTS)


class ClassSearchUnavailable(Exception):
    """Banner didn't answer, or answered with something other than search data."""


@dataclass(frozen=True)
class SearchFilters:
    """What Banner's searchResults filters by. Each code list matches any of its codes.

    Banner's day and time filters aren't here: its days match a meeting's
    exact pattern (Mon + Wed finds MW classes, not MWF), so the website
    filters days and times on the sections it gets back.
    """

    term: str
    subject: str = ""
    course_number: str = ""
    keyword: str = ""
    attributes: tuple[str, ...] = ()
    campuses: tuple[str, ...] = ()
    instructional_methods: tuple[str, ...] = ()
    parts_of_term: tuple[str, ...] = ()
    course_number_from: str = ""
    course_number_to: str = ""
    # Matched against instructor names, which Banner swaps for codes per session.
    instructor: str = ""
    offset: int = 0
    limit: int = 50

    def as_params(self, instructor_codes: list[str] | None = None) -> dict[str, str]:
        return {
            "txt_term": self.term,
            "txt_subject": self.subject,
            "txt_courseNumber": self.course_number,
            "txt_keywordlike": self.keyword,
            "txt_attribute": ",".join(self.attributes),
            "txt_campus": ",".join(self.campuses),
            "txt_instructionalMethod": ",".join(self.instructional_methods),
            "txt_partOfTerm": ",".join(self.parts_of_term),
            **self._course_number_range(),
            "txt_instructor": ",".join(instructor_codes or []),
            "startDatepicker": "",
            "endDatepicker": "",
            "pageOffset": str(self.offset),
            "pageMaxSize": str(self.limit),
            "sortColumn": "subjectDescription",
            "sortDirection": "asc",
        }

    def _course_number_range(self) -> dict[str, str]:
        """Banner ignores a range with one end, so an open end becomes 0000 or 9999."""
        if not (self.course_number_from or self.course_number_to):
            return {}
        return {
            "txt_course_number_range": self.course_number_from.zfill(
                COURSE_NUMBER_DIGITS
            ),
            "txt_course_number_range_to": self.course_number_to.zfill(
                COURSE_NUMBER_DIGITS
            )
            if self.course_number_to
            else HIGHEST_COURSE_NUMBER,
        }


def _name_words(name: str) -> list[str]:
    """Lowercase words of a name typed any way: "Hamid, Nahed", "N. Hamid".

    Banner's instructor lookup finds nothing for punctuation, even
    punctuation in the name itself ("abdul-hamid"), so it gets words.
    """
    return re.findall(r"\w+", name.casefold())


def _matching_instructor_codes(
    words: list[str], instructors: list[dict[str, Any]]
) -> list[str]:
    """Codes of the instructors whose full name contains every word, any order."""
    return [
        str(instructor["code"])
        for instructor in instructors
        if all(
            word in str(instructor.get("description", "")).casefold() for word in words
        )
    ][:MAX_INSTRUCTOR_MATCHES]


_EMPTY_SEARCH: dict[str, Any] = {"success": True, "totalCount": 0, "data": []}


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
        return _expect_list(
            await self._get("/classSearch/get_subject", _lookup_params(term, query))
        )

    async def get_lookup(self, lookup: str, term: str) -> list[dict[str, Any]]:
        """One of the class search's code lists, such as `attribute` or `campus`."""
        return _expect_list(
            await self._get(f"/classSearch/get_{lookup}", _lookup_params(term))
        )

    async def search(self, filters: SearchFilters) -> dict[str, Any]:
        async with _banner_slots, self._session() as session:
            try:
                selected = await session.post(
                    "/term/search",
                    params={"mode": "search"},
                    data={"term": filters.term},
                )
                selected.raise_for_status()
                instructor_codes = None
                if filters.instructor:
                    instructor_codes = await _instructor_codes(session, filters)
                    # No codes would send an empty filter, which matches every section.
                    if not instructor_codes:
                        return _EMPTY_SEARCH
                response = await session.get(
                    "/searchResults/searchResults",
                    params=filters.as_params(instructor_codes),
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


def _lookup_params(term: str, query: str = "") -> dict[str, str]:
    return {
        "searchTerm": query,
        "term": term,
        "offset": "1",
        "max": str(LOOKUP_PAGE_SIZE),
    }


async def _instructor_codes(
    session: httpx.AsyncClient, filters: SearchFilters
) -> list[str]:
    """Instructor codes only work in the session that looked them up."""
    words = _name_words(filters.instructor)
    if not words:
        return []
    # The lookup matches one fragment of a full name ("hamid", not "nahed hamid").
    response = await session.get(
        "/classSearch/get_instructor",
        params=_lookup_params(filters.term, max(words, key=len)),
    )
    response.raise_for_status()
    return _matching_instructor_codes(words, _expect_list(response.json()))


def _expect_list(body: Any) -> list[dict[str, Any]]:
    if not isinstance(body, list):
        raise ClassSearchUnavailable("Banner returned an unexpected lookup response")
    return body
