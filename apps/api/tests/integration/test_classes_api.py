from __future__ import annotations

from collections.abc import Iterator

import pytest
from httpx import AsyncClient

from app.main import app
from app.modules.classes.router import get_class_search_service
from tests.unit.test_class_search import FakeBanner


@pytest.fixture()
def banner() -> Iterator[FakeBanner]:
    fake = FakeBanner()
    app.dependency_overrides[get_class_search_service] = lambda: fake.service()
    yield fake
    app.dependency_overrides.pop(get_class_search_service, None)


class TestSearchRoute:
    async def test_returns_camel_case_sections(self, client: AsyncClient, banner):
        resp = await client.get(
            "/api/classes/search",
            params={"term": "202703", "subject": "cis", "courseNumber": "2168"},
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
            "/api/classes/search",
            params=[
                ("term", "202703"),
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
            "/api/classes/search",
            params={"term": "202703", "instructor": "  Nahed   Hamid "},
        )
        assert resp.status_code == 200
        assert banner.requests[-1].url.params["txt_instructor"] == "101"

    async def test_refining_filters_alone_arent_enough(
        self, client: AsyncClient, banner
    ):
        resp = await client.get(
            "/api/classes/search",
            params={"term": "202703", "campus": "MN", "instructionalMethod": "OLL"},
        )
        assert resp.status_code == 422
        assert banner.requests == []

    async def test_needs_a_filter(self, client: AsyncClient, banner):
        resp = await client.get("/api/classes/search", params={"term": "202703"})
        assert resp.status_code == 422
        assert banner.requests == []

    @pytest.mark.parametrize(
        "params",
        [
            {"term": "2027", "subject": "CIS"},
            {"term": "202703", "subject": "C1S"},
            {"term": "202703", "keyword": "a"},
            {"term": "202703", "subject": "CIS", "limit": "500"},
            {"term": "202703", "subject": "CIS", "courseNumberFrom": "30000"},
            {"term": "202703", "subject": "CIS", "campus": "M N"},
            {"term": "202703", "instructor": "x"},
        ],
    )
    async def test_rejects_bad_parameters(self, client: AsyncClient, banner, params):
        resp = await client.get("/api/classes/search", params=params)
        assert resp.status_code == 422

    async def test_reports_banner_outages_as_bad_gateway(self, client: AsyncClient):
        failing = FakeBanner(status=503)
        app.dependency_overrides[get_class_search_service] = lambda: failing.service()
        try:
            resp = await client.get(
                "/api/classes/search", params={"term": "202703", "subject": "CIS"}
            )
        finally:
            app.dependency_overrides.pop(get_class_search_service, None)
        assert resp.status_code == 502
        assert resp.headers["content-type"] == "application/problem+json"
        assert "isn't responding" in resp.json()["detail"]


class TestLookupRoutes:
    async def test_terms(self, client: AsyncClient, banner):
        resp = await client.get("/api/classes/terms")
        assert resp.json() == [{"code": "202703", "description": "2027 Spring"}]

    async def test_subjects(self, client: AsyncClient, banner):
        resp = await client.get(
            "/api/classes/subjects", params={"term": "202703", "q": "cis"}
        )
        assert resp.json()[0]["description"] == "Computer & Information Science"

    async def test_campuses(self, client: AsyncClient, banner):
        resp = await client.get("/api/classes/campuses", params={"term": "202703"})
        assert resp.json() == [{"code": "MN", "description": "Main"}]

    async def test_parts_of_term(self, client: AsyncClient, banner):
        resp = await client.get("/api/classes/parts-of-term", params={"term": "202703"})
        assert resp.json()[0]["code"] == "07A"
