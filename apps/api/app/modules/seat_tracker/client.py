"""Banner's public section pages by CRN: the class details and enrollment
fragments Browse Classes opens, which need no student login.
"""

from __future__ import annotations

import asyncio
import logging
import re
from dataclasses import dataclass

import httpx
from bs4 import BeautifulSoup

from app.modules.classes.client import (
    REQUEST_TIMEOUT_SECONDS,
    TEMPLE_SSB_BASE_URL,
    USER_AGENT,
)

logger = logging.getLogger(__name__)

DETAILS_PATH = "/searchResults/getClassDetails"
ENROLLMENT_PATH = "/searchResults/getEnrollmentInfo"
# Each check run reads every watched CRN; Banner is shared with all of Temple.
MAX_CONCURRENT_REQUESTS = 5
_banner_slots = asyncio.Semaphore(MAX_CONCURRENT_REQUESTS)

_ENROLLMENT_LABELS = {
    "Enrollment Maximum": "maximum_enrollment",
    "Enrollment Seats Available": "seats_available",
    "Waitlist Capacity": "wait_capacity",
    "Waitlist Actual": "wait_count",
    "Waitlist Seats Available": "wait_available",
}
_ENROLLMENT_PATTERN = re.compile(
    r'<span class="status-bold">\s*([A-Za-z ]+?):\s*</span>\s*'
    r"<span[^>]*>\s*(-?\d+)\s*</span>"
)


class SectionUnavailable(Exception):
    """Banner didn't answer, or answered with something other than the fragment."""


class SectionNotFound(Exception):
    """Banner has no section with this CRN in the term."""


@dataclass(frozen=True)
class SectionDetails:
    title: str
    subject: str
    course_number: str
    section: str


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


def parse_details(fragment: str) -> SectionDetails:
    soup = BeautifulSoup(fragment, "lxml")

    def text(element_id: str) -> str:
        element = soup.find(id=element_id)
        return " ".join(element.get_text().split()) if element else ""

    title = text("courseTitle")
    if not title:
        raise SectionNotFound
    return SectionDetails(
        title=title,
        subject=text("subject"),
        course_number=text("courseNumber"),
        section=text("sectionNumber"),
    )


def parse_enrollment(fragment: str) -> Enrollment:
    values = {
        _ENROLLMENT_LABELS[label]: int(value)
        for label, value in _ENROLLMENT_PATTERN.findall(fragment)
        if label in _ENROLLMENT_LABELS
    }
    if values.keys() != set(_ENROLLMENT_LABELS.values()):
        raise SectionUnavailable("Banner returned an unexpected enrollment fragment")
    return Enrollment(**values)


class BannerSectionClient:
    def __init__(
        self,
        base_url: str = TEMPLE_SSB_BASE_URL,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._transport = transport

    async def details(self, term: str, crn: str) -> SectionDetails:
        return parse_details(await self._fragment(DETAILS_PATH, term, crn))

    async def enrollment(self, term: str, crn: str) -> Enrollment:
        return parse_enrollment(await self._fragment(ENROLLMENT_PATH, term, crn))

    async def _fragment(self, path: str, term: str, crn: str) -> str:
        async with (
            _banner_slots,
            httpx.AsyncClient(
                base_url=self._base_url,
                timeout=REQUEST_TIMEOUT_SECONDS,
                transport=self._transport,
                headers={"User-Agent": USER_AGENT},
            ) as session,
        ):
            try:
                response = await session.post(
                    path, data={"term": term, "courseReferenceNumber": crn}
                )
                response.raise_for_status()
            except httpx.HTTPError as exc:
                logger.warning("Banner %s failed for %s: %s", path, crn, exc)
                raise SectionUnavailable from exc
        return response.text
