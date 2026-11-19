"""Banner's public section lookup by CRN: the JSON behind Browse Classes'
"Instructor/Meeting Times" tab, which needs no student login. With
`first=first` it adds the whole section, live seat counts included.
"""

from __future__ import annotations

import asyncio
import html
import logging
import re
from dataclasses import dataclass
from typing import Any

import httpx2

from app.modules.classes.client import (
    REQUEST_TIMEOUT_SECONDS,
    TEMPLE_SSB_BASE_URL,
    USER_AGENT,
)
from app.modules.classes.seats import seats_left

logger = logging.getLogger(__name__)

SECTION_PATH = "/searchResults/getFacultyMeetingTimes"
# Each check run reads every watched CRN; Banner is shared with all of Temple.
MAX_CONCURRENT_REQUESTS = 5
_banner_slots = asyncio.Semaphore(MAX_CONCURRENT_REQUESTS)
# Banner has no "not found" answer: for a CRN the term lacks, building the
# section from null fails with a 500 that says so.
_NULL_SECTION_ERROR = re.compile(r"SectionDecorator.*for \[null\]", re.DOTALL)


class SectionUnavailable(Exception):
    """Banner didn't answer, or answered with something other than the section."""


class SectionNotFound(Exception):
    """Banner has no section with this CRN in the term."""


@dataclass(frozen=True)
class Enrollment:
    """Banner's counts. Negative seats mean over-enrolled, never open."""

    seats_available: int
    maximum_enrollment: int
    wait_count: int
    wait_capacity: int
    wait_available: int

    @property
    def is_open(self) -> bool:
        return self.seats_available > 0


@dataclass(frozen=True)
class BannerSection:
    title: str
    subject: str
    subject_description: str
    course_number: str
    section: str
    enrollment: Enrollment


def parse_section(body: Any) -> BannerSection:
    """The `section` of a `first=first` answer. Its text is HTML-escaped."""
    try:
        section = body["section"]
        return BannerSection(
            title=html.unescape(section["courseTitle"]),
            subject=section["subject"],
            subject_description=html.unescape(section["subjectDescription"]),
            course_number=section["courseNumber"],
            section=section["sequenceNumber"],
            enrollment=Enrollment(
                seats_available=seats_left(
                    section["seatsAvailable"], section["crossListAvailable"]
                ),
                maximum_enrollment=section["maximumEnrollment"],
                wait_count=section["waitCount"],
                wait_capacity=section["waitCapacity"],
                wait_available=section["waitAvailable"],
            ),
        )
    except (KeyError, TypeError) as exc:
        raise SectionUnavailable("Banner returned an unexpected section") from exc


def _is_missing_section(error: httpx2.HTTPError) -> bool:
    return isinstance(error, httpx2.HTTPStatusError) and bool(
        _NULL_SECTION_ERROR.search(error.response.text)
    )


class BannerSectionClient:
    def __init__(
        self,
        base_url: str = TEMPLE_SSB_BASE_URL,
        *,
        transport: httpx2.AsyncBaseTransport | None = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._transport = transport

    async def section(self, term: str, crn: str) -> BannerSection:
        async with (
            _banner_slots,
            httpx2.AsyncClient(
                base_url=self._base_url,
                timeout=REQUEST_TIMEOUT_SECONDS,
                transport=self._transport,
                headers={"User-Agent": USER_AGENT},
            ) as session,
        ):
            try:
                response = await session.get(
                    SECTION_PATH,
                    params={
                        "term": term,
                        "courseReferenceNumber": crn,
                        "first": "first",
                    },
                )
                response.raise_for_status()
                body = response.json()
            except httpx2.HTTPError as exc:
                if _is_missing_section(exc):
                    raise SectionNotFound from exc
                logger.warning("Banner %s failed for %s: %s", SECTION_PATH, crn, exc)
                raise SectionUnavailable from exc
            except ValueError as exc:
                raise SectionUnavailable("Banner didn't answer with JSON") from exc
        return parse_section(body)
