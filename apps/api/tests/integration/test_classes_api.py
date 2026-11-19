from __future__ import annotations

import json
from collections.abc import Callable, Iterator

import pytest
from httpx2 import AsyncClient

from app.core.http_cache import public_cache_control
from app.main import app
from app.modules.classes.router import get_class_search_service
from app.modules.classes.service import (
    LOOKUP_TTL_SECONDS,
    MISSING_SECTION_TTL_SECONDS,
    SEARCH_TTL_SECONDS,
)
from tests.conftest import FIXTURES_DIR
from tests.unit.test_class_search import FakeBanner


@pytest.fixture()
def banner() -> Iterator[FakeBanner]:
    fake = FakeBanner()
    app.dependency_overrides[get_class_search_service] = lambda: fake.service()
    yield fake
    app.dependency_overrides.pop(get_class_search_service, None)


SECTIONS = "/api/classes/terms/202703/sections"


class TestSearchRoute:
    async def test_returns_camel_case_sections(self, client: AsyncClient, banner):
        resp = await client.get(
            SECTIONS,
            params={"subject": "cis", "courseNumber": "2168"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["totalCount"] == 2
        assert "fetchedAt" in body
        section = body["sections"][0]
        assert section["courseReferenceNumber"] == "10001"
        assert section["meetingsFaculty"][0]["meetingTime"]["beginTime"] == "0900"
        sent = banner.requests[-1].url.params
        assert sent["txt_subject"] == "CIS"
        assert sent["txt_courseNumber"] == "2168"

    async def test_sends_repeated_codes_and_a_course_number_range(
        self, client: AsyncClient, banner
    ):
        resp = await client.get(
            SECTIONS,
            params=[
                ("attribute", "ga"),
                ("attribute", "GW"),
                ("attribute", "GA"),
                ("instructionalMethod", "OLL"),
                ("campus", "MN"),
                ("partOfTerm", "07A"),
                ("courseNumberFrom", "3000"),
            ],
        )
        assert resp.status_code == 200
        sent = banner.requests[-1].url.params
        assert sent["txt_attribute"] == "GA,GW"
        assert sent["txt_instructionalMethod"] == "OLL"
        assert sent["txt_campus"] == "MN"
        assert sent["txt_partOfTerm"] == "07A"
        assert sent["txt_course_number_range"] == "3000"
        assert sent["txt_course_number_range_to"] == "9999"

    async def test_searches_by_instructor_alone(self, client: AsyncClient, banner):
        resp = await client.get(
            SECTIONS,
            params={"instructor": "  Nahed   Hamid "},
        )
        assert resp.status_code == 200
        assert banner.requests[-1].url.params["txt_instructor"] == "101"

    async def test_refining_filters_alone_arent_enough(
        self, client: AsyncClient, banner
    ):
        resp = await client.get(
            SECTIONS,
            params={"campus": "MN", "instructionalMethod": "OLL"},
        )
        assert resp.status_code == 422
        assert banner.requests == []

    async def test_needs_a_filter(self, client: AsyncClient, banner):
        resp = await client.get(SECTIONS)
        assert resp.status_code == 422
        assert banner.requests == []

    @pytest.mark.parametrize(
        ("term", "params"),
        [
            ("2027", {"subject": "CIS"}),
            ("202703", {"subject": "C1S"}),
            ("202703", {"keyword": "a"}),
            ("202703", {"subject": "CIS", "limit": "500"}),
            ("202703", {"subject": "CIS", "courseNumberFrom": "30000"}),
            ("202703", {"subject": "CIS", "campus": "M N"}),
            ("202703", {"instructor": "x"}),
        ],
    )
    async def test_rejects_bad_parameters(
        self, client: AsyncClient, banner, term, params
    ):
        resp = await client.get(f"/api/classes/terms/{term}/sections", params=params)
        assert resp.status_code == 422

    async def test_pages_by_cursor(self, client: AsyncClient, use_banner):
        body = json.loads((FIXTURES_DIR / "class_search.json").read_text())
        body["totalCount"] = 5
        banner = FakeBanner(search_body=body)
        use_banner(banner)
        first = await client.get(SECTIONS, params={"subject": "CIS"})
        assert first.status_code == 200
        assert first.headers["cache-control"] == public_cache_control(
            SEARCH_TTL_SECONDS
        )
        cursor = first.json()["nextCursor"]
        assert cursor

        await client.get(SECTIONS, params={"subject": "CIS", "cursor": cursor})
        assert banner.requests[-1].url.params["pageOffset"] == "2"

    async def test_the_last_page_has_no_cursor(self, client: AsyncClient, banner):
        resp = await client.get(SECTIONS, params={"subject": "CIS"})
        assert resp.json()["nextCursor"] is None

    async def test_rejects_a_cursor_it_didnt_give(self, client: AsyncClient, banner):
        resp = await client.get(SECTIONS, params={"subject": "CIS", "cursor": "nope"})
        assert resp.status_code == 422
        assert banner.requests == []

    async def test_reports_banner_outages_as_bad_gateway(self, client: AsyncClient):
        failing = FakeBanner(status=503)
        app.dependency_overrides[get_class_search_service] = lambda: failing.service()
        try:
            resp = await client.get(SECTIONS, params={"subject": "CIS"})
        finally:
            app.dependency_overrides.pop(get_class_search_service, None)
        assert resp.status_code == 502
        assert resp.headers["content-type"] == "application/problem+json"
        assert "isn't responding" in resp.json()["detail"]


class TestLookupRoutes:
    async def test_terms(self, client: AsyncClient, banner):
        resp = await client.get("/api/classes/terms")
        assert resp.json() == {
            "terms": [{"code": "202703", "description": "2027 Spring"}]
        }
        assert resp.headers["cache-control"] == public_cache_control(LOOKUP_TTL_SECONDS)

    async def test_subjects(self, client: AsyncClient, banner):
        resp = await client.get(
            "/api/classes/terms/202703/subjects", params={"q": "cis"}
        )
        assert resp.json()["subjects"][0]["description"] == (
            "Computer & Information Science"
        )

    async def test_campuses(self, client: AsyncClient, banner):
        resp = await client.get("/api/classes/terms/202703/campuses")
        assert resp.json() == {"campuses": [{"code": "MN", "description": "Main"}]}

    async def test_parts_of_term(self, client: AsyncClient, banner):
        resp = await client.get("/api/classes/terms/202703/parts-of-term")
        assert resp.json()["partsOfTerm"][0]["code"] == "07A"


def section_path(term: str, crn: str) -> str:
    return f"/api/classes/terms/{term}/sections/{crn}"


@pytest.fixture()
def use_banner() -> Iterator[Callable[[FakeBanner], None]]:
    def use(fake: FakeBanner) -> None:
        app.dependency_overrides[get_class_search_service] = lambda: fake.service()

    yield use
    app.dependency_overrides.pop(get_class_search_service, None)


class TestSectionRoute:
    async def test_names_the_course(self, client: AsyncClient, banner):
        resp = await client.get(section_path("202703", "50067"))
        assert resp.status_code == 200
        assert resp.json() == {
            "crn": "50067",
            "title": "Software Security",
            "subject": "CIS",
            "courseNumber": "3441",
            "section": "702",
        }
        assert resp.headers["cache-control"] == public_cache_control(LOOKUP_TTL_SECONDS)

    async def test_unknown_crn_is_not_found(self, client: AsyncClient, banner):
        resp = await client.get(section_path("202703", "99999"))
        assert resp.status_code == 404
        assert resp.headers["content-type"] == "application/problem+json"
        assert resp.json()["detail"] == "There's no CRN 99999 in this term."
        assert resp.headers["cache-control"] == public_cache_control(
            MISSING_SECTION_TTL_SECONDS
        )

    @pytest.mark.parametrize(
        ("crn", "term"), [("123", "202703"), ("123456", "202703"), ("50067", "2027")]
    )
    async def test_rejects_bad_parameters(self, client: AsyncClient, banner, crn, term):
        resp = await client.get(section_path(term, crn))
        assert resp.status_code == 422
        assert banner.requests == []

    async def test_reports_banner_errors_as_bad_gateway(
        self, client: AsyncClient, use_banner
    ):
        use_banner(FakeBanner(status=503))
        resp = await client.get(section_path("202703", "50067"))
        assert resp.status_code == 502
        assert resp.headers["cache-control"] == "no-store"

    async def test_reports_banner_timeouts_as_gateway_timeout(
        self, client: AsyncClient, use_banner
    ):
        use_banner(FakeBanner(times_out=True))
        resp = await client.get(section_path("202703", "50067"))
        assert resp.status_code == 504
        assert resp.headers["cache-control"] == "no-store"
