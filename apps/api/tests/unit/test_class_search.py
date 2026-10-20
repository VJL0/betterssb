from __future__ import annotations

import json

import httpx
import pytest

from app.modules.classes.client import (
    BannerClassSearchClient,
    ClassSearchUnavailable,
    SearchFilters,
)
from app.modules.classes.service import (
    LOOKUP_TTL_SECONDS,
    SEARCH_TTL_SECONDS,
    ClassSearchService,
)
from tests.conftest import FIXTURES_DIR

BASE_URL = "https://banner.example.edu/StudentRegistrationSsb/ssb"


class MemoryCache:
    def __init__(self) -> None:
        self.values: dict[str, str] = {}
        self.ttls: dict[str, int] = {}

    async def get(self, name: str) -> str | None:
        return self.values.get(name)

    async def set(self, name: str, value: str, ex: int, nx: bool = False) -> bool:
        if nx and name in self.values:
            return False
        self.values[name] = value
        self.ttls[name] = ex
        return True


class FakeBanner:
    """Records requests and answers like Banner's public class search."""

    def __init__(self, search_body: object | None = None, status: int = 200) -> None:
        self.requests: list[httpx.Request] = []
        self.search_body = search_body or json.loads(
            (FIXTURES_DIR / "class_search.json").read_text()
        )
        self.status = status
        self.sessions = 0

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if self.status != 200:
            return httpx.Response(self.status)
        path = request.url.path
        if path.endswith("/term/search"):
            self.sessions += 1
            return httpx.Response(
                200,
                json={"fwdURL": "/classSearch/classSearch"},
                headers={"Set-Cookie": f"JSESSIONID=s{self.sessions}; Path=/"},
            )
        if path.endswith("/searchResults/searchResults"):
            return httpx.Response(200, json=self.search_body)
        if path.endswith("/classSearch/getTerms"):
            return httpx.Response(
                200, json=[{"code": "202703", "description": "2027 Spring"}]
            )
        if path.endswith("/classSearch/get_subject"):
            return httpx.Response(
                200,
                json=[
                    {"code": "CIS", "description": "Computer &amp; Information Science"}
                ],
            )
        return httpx.Response(404)

    def service(self, cache: MemoryCache | None = None) -> ClassSearchService:
        client = BannerClassSearchClient(
            BASE_URL, transport=httpx.MockTransport(self.handler)
        )
        return ClassSearchService(client, cache)

    def paths(self) -> list[str]:
        return [
            r.url.path.removeprefix("/StudentRegistrationSsb/ssb")
            for r in self.requests
        ]


FILTERS = SearchFilters(term="202703", subject="CIS", course_number="2168")


class TestSearch:
    async def test_selects_the_term_then_searches(self):
        banner = FakeBanner()
        await banner.service().search(FILTERS)
        assert banner.paths() == ["/term/search", "/searchResults/searchResults"]
        term_post, search = banner.requests
        assert term_post.method == "POST"
        assert term_post.content == b"term=202703"
        assert search.url.params["txt_subject"] == "CIS"
        assert search.url.params["txt_courseNumber"] == "2168"
        assert search.url.params["txt_term"] == "202703"

    async def test_each_search_uses_a_fresh_session(self):
        """Banner keeps the last search in the session, so cookies must not carry over."""
        banner = FakeBanner()
        service = banner.service()
        await service.search(FILTERS)
        await service.search(SearchFilters(term="202703", keyword="algebra"))
        first_term, first_search, second_term, second_search = banner.requests
        assert "cookie" not in first_term.headers
        assert first_search.headers["cookie"] == "JSESSIONID=s1"
        assert "cookie" not in second_term.headers
        assert second_search.headers["cookie"] == "JSESSIONID=s2"

    async def test_returns_sections_with_text_unescaped(self):
        result = await FakeBanner().service().search(FILTERS)
        assert result.total_count == 2
        first = result.sections[0]
        assert first.subject_description == "Computer & Information Science"
        assert (
            first.meetings_faculty[0].meeting_time.building_description
            == "Science Education & Research"
        )
        assert result.sections[1].meetings_faculty[0].meeting_time.begin_time is None

    async def test_serves_repeat_searches_from_cache(self):
        banner = FakeBanner()
        cache = MemoryCache()
        service = banner.service(cache)
        first = await service.search(FILTERS)
        again = await service.search(FILTERS)
        assert len(banner.requests) == 2
        assert again == first
        assert list(cache.ttls.values()) == [SEARCH_TTL_SECONDS]

    async def test_a_broken_cache_doesnt_break_search(self):
        class DownCache:
            async def get(self, name: str) -> str | None:
                raise ConnectionError("redis is down")

            async def set(self, name: str, value: str, ex: int) -> None:
                raise ConnectionError("redis is down")

        result = await FakeBanner().service(DownCache()).search(FILTERS)
        assert result.total_count == 2

    async def test_different_filters_are_cached_separately(self):
        banner = FakeBanner()
        service = banner.service(MemoryCache())
        await service.search(FILTERS)
        await service.search(SearchFilters(term="202703", subject="MATH"))
        assert banner.paths().count("/searchResults/searchResults") == 2

    @pytest.mark.parametrize(
        "banner",
        [
            FakeBanner(status=503),
            FakeBanner(search_body={"success": False}),
            FakeBanner(search_body=["not", "a", "search"]),
        ],
    )
    async def test_unusable_responses_raise_unavailable(self, banner: FakeBanner):
        with pytest.raises(ClassSearchUnavailable):
            await banner.service().search(FILTERS)

    async def test_transport_errors_raise_unavailable(self):
        def fail(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectTimeout("timed out", request=request)

        client = BannerClassSearchClient(BASE_URL, transport=httpx.MockTransport(fail))
        with pytest.raises(ClassSearchUnavailable):
            await ClassSearchService(client, None).search(FILTERS)


class TestLookups:
    async def test_terms_are_cached_for_a_day(self):
        banner = FakeBanner()
        cache = MemoryCache()
        service = banner.service(cache)
        terms = await service.terms()
        await service.terms()
        assert [t.code for t in terms] == ["202703"]
        assert len(banner.requests) == 1
        assert cache.ttls == {"classes:terms": LOOKUP_TTL_SECONDS}

    async def test_subjects_are_unescaped_and_keyed_by_query(self):
        banner = FakeBanner()
        cache = MemoryCache()
        subjects = await banner.service(cache).subjects("202703", " cis ")
        assert subjects[0].description == "Computer & Information Science"
        assert banner.requests[0].url.params["searchTerm"] == "CIS"
        assert "classes:subjects:202703:CIS" in cache.values
