from __future__ import annotations

from typing import Any

import httpx2
import pytest

from app.modules.classes.section_client import (
    BannerSection,
    BannerSectionClient,
    Enrollment,
    SectionNotFound,
    SectionUnavailable,
    parse_section,
)

# Trimmed from Banner's 500 page for a CRN the term doesn't have.
UNKNOWN_CRN_ERROR_PAGE = """
<meta name="errorMessage" content="Ambiguous method overloading for method
net.hedtech.banner.student.schedule.SectionDecorator#&lt;init&gt;.
Cannot resolve which method to invoke for [null] due to overlapping prototypes between:
"/>
"""


def section_answer(
    *,
    seats: int = 0,
    maximum: int = 30,
    cross_list_available: int | None = None,
) -> dict[str, Any]:
    """Trimmed from `getFacultyMeetingTimes?first=first` (reverse-engineering captures)."""
    return {
        "fmt": [],
        "section": {
            "courseReferenceNumber": "50067",
            "subject": "CIS",
            "subjectDescription": "Computer &amp; Information Science",
            "courseNumber": "3441",
            "sequenceNumber": "702",
            "courseTitle": "Software Security",
            "maximumEnrollment": maximum,
            "enrollment": maximum - seats,
            "seatsAvailable": seats,
            "waitCapacity": 100,
            "waitCount": 15,
            "waitAvailable": 85,
            "crossList": None if cross_list_available is None else "2I",
            "crossListAvailable": cross_list_available,
        },
    }


class TestParseSection:
    def test_reads_the_course_and_its_seats(self):
        assert parse_section(section_answer(seats=2)) == BannerSection(
            title="Software Security",
            subject="CIS",
            subject_description="Computer & Information Science",
            course_number="3441",
            section="702",
            enrollment=Enrollment(
                seats_available=2,
                maximum_enrollment=30,
                wait_count=15,
                wait_capacity=100,
                wait_available=85,
            ),
        )

    @pytest.mark.parametrize(("seats", "is_open"), [(-1, False), (0, False), (1, True)])
    def test_only_positive_seats_are_open(self, seats: int, is_open: bool):
        enrollment = parse_section(section_answer(seats=seats)).enrollment
        assert enrollment.is_open is is_open

    @pytest.mark.parametrize(("group", "seats"), [(0, 0), (-2, -2), (3, 3), (40, 32)])
    def test_a_cross_listed_section_has_only_its_groups_room(
        self, group: int, seats: int
    ):
        answer = section_answer(seats=32, maximum=38, cross_list_available=group)
        assert parse_section(answer).enrollment.seats_available == seats

    def test_a_login_page_isnt_read_as_a_section(self):
        with pytest.raises(SectionUnavailable):
            parse_section({"fmt": []})


class TestClient:
    async def test_asks_for_the_whole_section(self):
        requests: list[httpx2.Request] = []

        def handler(request: httpx2.Request) -> httpx2.Response:
            requests.append(request)
            return httpx2.Response(200, json=section_answer())

        client = BannerSectionClient(transport=httpx2.MockTransport(handler))
        await client.section("202703", "50067")

        [request] = requests
        assert request.method == "GET"
        assert request.url.path.endswith("/searchResults/getFacultyMeetingTimes")
        assert dict(request.url.params) == {
            "term": "202703",
            "courseReferenceNumber": "50067",
            "first": "first",
        }

    async def test_an_http_error_is_unavailable(self):
        client = BannerSectionClient(
            transport=httpx2.MockTransport(lambda _: httpx2.Response(503))
        )
        with pytest.raises(SectionUnavailable):
            await client.section("202703", "50067")

    async def test_an_answer_that_isnt_json_is_unavailable(self):
        client = BannerSectionClient(
            transport=httpx2.MockTransport(
                lambda _: httpx2.Response(200, text="<title>Sign in</title>")
            )
        )
        with pytest.raises(SectionUnavailable):
            await client.section("202703", "50067")

    async def test_an_unknown_crn_is_not_found(self):
        """Banner fails with a 500 naming a null section (checked live, Nov 2026)."""
        client = BannerSectionClient(
            transport=httpx2.MockTransport(
                lambda _: httpx2.Response(500, text=UNKNOWN_CRN_ERROR_PAGE)
            )
        )
        with pytest.raises(SectionNotFound):
            await client.section("202703", "99999")

    async def test_other_server_errors_are_unavailable(self):
        client = BannerSectionClient(
            transport=httpx2.MockTransport(
                lambda _: httpx2.Response(500, text="<title>Banner</title>")
            )
        )
        with pytest.raises(SectionUnavailable):
            await client.section("202703", "50067")
