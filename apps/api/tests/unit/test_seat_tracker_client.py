from __future__ import annotations

import httpx
import pytest

from app.modules.seat_tracker.client import (
    BannerSectionClient,
    Enrollment,
    SectionDetails,
    SectionNotFound,
    SectionUnavailable,
    parse_details,
    parse_enrollment,
)

# Trimmed from Banner's Browse Classes responses (data/ssb HARs).
DETAILS_FRAGMENT = """
<section aria-labelledby="classDetails">
    <span class="status-bold">CRN:</span><span
        id="courseReferenceNumber">50067</span><br/>
    <span class="status-bold">Section Number:</span>
    <span id="sectionNumber">702</span>
    <span class="status-bold">Subject:</span>
    <span id="subject">Computer &amp; Information Science</span>
    <span id="courseNumber" style="display:none;">3441</span>
    <span id="courseDisplay">3441</span>
    <span class="status-bold">Title:</span>
    <span id="courseTitle">Software Security</span>
</section>
"""


def enrollment_fragment(*, seats: int = 0, maximum: int = 30) -> str:
    return f"""
<section aria-labelledby="enrollmentInfo">
        <span class="status-bold">Enrollment Actual:</span> <span
                dir="ltr">{maximum - seats}</span><br/>
        <span class="status-bold">Enrollment Maximum:</span> <span
                dir="ltr">{maximum}</span><br/>
        <span class="status-bold">Enrollment Seats Available:</span> <span
                dir="ltr">{seats}</span>  <br/>
        <hr/>
        <span class="status-bold">Waitlist Capacity:</span> <span
                dir="ltr">100</span><br/>
        <span class="status-bold">Waitlist Actual:</span> <span
                dir="ltr">15</span><br/>
        <span class="status-bold">Waitlist Seats Available:</span> <span
                dir="ltr">85</span><br/>
</section>
"""


class TestParseDetails:
    def test_reads_the_section(self):
        assert parse_details(DETAILS_FRAGMENT) == SectionDetails(
            title="Software Security",
            subject="Computer & Information Science",
            course_number="3441",
            section="702",
        )

    def test_a_crn_banner_doesnt_have_has_no_title(self):
        with pytest.raises(SectionNotFound):
            parse_details('<section aria-labelledby="classDetails"></section>')


class TestParseEnrollment:
    def test_reads_seats_and_waitlist(self):
        assert parse_enrollment(enrollment_fragment(seats=2)) == Enrollment(
            seats_available=2,
            maximum_enrollment=30,
            wait_count=15,
            wait_capacity=100,
            wait_available=85,
        )

    @pytest.mark.parametrize(("seats", "is_open"), [(-1, False), (0, False), (1, True)])
    def test_only_positive_seats_are_open(self, seats: int, is_open: bool):
        assert parse_enrollment(enrollment_fragment(seats=seats)).is_open is is_open

    def test_a_login_page_isnt_read_as_seats(self):
        with pytest.raises(SectionUnavailable):
            parse_enrollment("<html><title>Sign in</title></html>")


class TestClient:
    async def test_posts_the_term_and_crn(self):
        requests: list[httpx.Request] = []

        def handler(request: httpx.Request) -> httpx.Response:
            requests.append(request)
            return httpx.Response(200, text=enrollment_fragment())

        client = BannerSectionClient(transport=httpx.MockTransport(handler))
        await client.enrollment("202703", "50067")

        [request] = requests
        assert request.url.path.endswith("/searchResults/getEnrollmentInfo")
        assert request.content == b"term=202703&courseReferenceNumber=50067"

    async def test_an_http_error_is_unavailable(self):
        client = BannerSectionClient(
            transport=httpx.MockTransport(lambda _: httpx.Response(503))
        )
        with pytest.raises(SectionUnavailable):
            await client.details("202703", "50067")
