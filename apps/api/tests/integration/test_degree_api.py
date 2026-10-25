from __future__ import annotations

from collections.abc import Iterator

import httpx
import pytest
from httpx import AsyncClient

from app.main import app
from app.modules.degree.router import get_bulletin_service
from tests.unit.test_bulletin_service import (
    ARCHIVED_INDEX_PATH,
    ARCHIVED_YEAR,
    COURSE_CODE,
    GAP_YEAR,
    MISSING_YEAR,
    PROGRAM_URL,
    FakeBulletin,
)


@pytest.fixture()
def bulletin() -> Iterator[FakeBulletin]:
    fake = FakeBulletin()
    app.dependency_overrides[get_bulletin_service] = lambda: fake.service()
    yield fake
    app.dependency_overrides.pop(get_bulletin_service, None)


class TestProgramsRoute:
    async def test_returns_camel_case_programs(self, client: AsyncClient, bulletin):
        resp = await client.get("/api/degree/programs", params={"year": ARCHIVED_YEAR})
        assert resp.status_code == 200
        body = resp.json()
        assert body["bulletinYear"] == ARCHIVED_YEAR
        assert body["sourceUrl"].endswith(ARCHIVED_INDEX_PATH)
        assert {
            "name": "Computer Science",
            "degree": "BS",
            "note": "",
            "level": "undergraduate",
            "college": "ST",
            "collegeName": "College of Science & Technology",
            "degreeName": "Bachelor of Science",
            "hasOptions": False,
            "url": PROGRAM_URL,
        } in body["programs"]

    @pytest.mark.parametrize("year", ["latest", "24-25", f"{MISSING_YEAR}x"])
    async def test_rejects_bad_years(self, client: AsyncClient, bulletin, year):
        resp = await client.get("/api/degree/programs", params={"year": year})
        assert resp.status_code == 422
        assert bulletin.requests == []

    async def test_a_year_not_online_returns_the_year_before(
        self, client: AsyncClient, bulletin
    ):
        resp = await client.get("/api/degree/programs", params={"year": GAP_YEAR})
        assert resp.status_code == 200
        body = resp.json()
        assert (body["requestedYear"], body["bulletinYear"]) == (
            GAP_YEAR,
            ARCHIVED_YEAR,
        )

    async def test_missing_years_are_not_found(self, client: AsyncClient, bulletin):
        resp = await client.get("/api/degree/programs", params={"year": MISSING_YEAR})
        assert resp.status_code == 404
        assert resp.headers["content-type"] == "application/problem+json"
        assert f"{MISSING_YEAR} Bulletin" in resp.json()["detail"]

    async def test_reports_outages_as_bad_gateway(self, client: AsyncClient):
        failing = FakeBulletin({ARCHIVED_INDEX_PATH: httpx.Response(503)})
        app.dependency_overrides[get_bulletin_service] = lambda: failing.service()
        try:
            resp = await client.get(
                "/api/degree/programs", params={"year": ARCHIVED_YEAR}
            )
        finally:
            app.dependency_overrides.pop(get_bulletin_service, None)
        assert resp.status_code == 502
        assert "isn't responding" in resp.json()["detail"]


class TestRequirementsRoute:
    async def test_returns_parsed_requirements(self, client: AsyncClient, bulletin):
        resp = await client.get("/api/degree/requirements", params={"url": PROGRAM_URL})
        assert resp.status_code == 200
        body = resp.json()
        assert body["name"] == "Computer Science BS"
        assert body["bulletinUrl"] == PROGRAM_URL

    @pytest.mark.parametrize(
        "url",
        [
            "https://example.com/undergraduate/x/",
            "https://bulletin.temple.edu.example.com/undergraduate/x/",
            "http://bulletin.temple.edu/undergraduate/x/",
            "https://bulletin.temple.edu/academic-programs/",
            "https://bulletin.temple.edu/undergraduate/../../etc/",
        ],
    )
    async def test_only_accepts_bulletin_program_pages(
        self, client: AsyncClient, bulletin, url
    ):
        resp = await client.get("/api/degree/requirements", params={"url": url})
        assert resp.status_code == 422
        assert bulletin.requests == []

    async def test_missing_pages_are_not_found(self, client: AsyncClient, bulletin):
        resp = await client.get(
            "/api/degree/requirements",
            params={"url": "https://bulletin.temple.edu/undergraduate/x/"},
        )
        assert resp.status_code == 404


class TestCoursesRoute:
    async def test_returns_the_course(self, client: AsyncClient, bulletin):
        resp = await client.get(
            "/api/degree/courses", params={"code": COURSE_CODE, "year": ARCHIVED_YEAR}
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == COURSE_CODE
        assert body["prerequisiteCourses"] == ["CIS 2168", "CIS 3203", "CIS 3207"]

    @pytest.mark.parametrize("code", ["cis 3296", "CIS3296", "CIS 32"])
    async def test_rejects_bad_codes(self, client: AsyncClient, bulletin, code):
        resp = await client.get(
            "/api/degree/courses", params={"code": code, "year": ARCHIVED_YEAR}
        )
        assert resp.status_code == 422

    async def test_unknown_courses_are_not_found(self, client: AsyncClient, bulletin):
        resp = await client.get(
            "/api/degree/courses", params={"code": "CIS 9999", "year": ARCHIVED_YEAR}
        )
        assert resp.status_code == 404
        assert "CIS 9999" in resp.json()["detail"]
