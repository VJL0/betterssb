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
        if path.endswith("/classSearch/get_campus"):
            return httpx.Response(200, json=[{"code": "MN", "description": "Main"}])
        if path.endswith("/classSearch/get_partOfTerm"):
            return httpx.Response(
                200,
                json=[
                    {
                        "code": "07A",
                        "description": "7-week Courses (7A) 01/11/2027 - 03/08/2027",
                    }
                ],
            )
        if path.endswith("/classSearch/get_instructor"):
            # Banner numbers instructors per session, so codes differ between searches.
            return httpx.Response(
                200,
                json=[
                    {"code": f"{self.sessions}01", "description": "Nahed Hamid"},
                    {"code": f"{self.sessions}02", "description": "Hamid Heravi"},
                    {
                        "code": f"{self.sessions}03",
                        "description": "Idrisa B. Abdul-Hamid",
                    },
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

    async def test_empty_results_are_not_cached(self):
        """Banner sometimes answers with nothing for a moment; that mustn't stick."""
        banner = FakeBanner(search_body={"success": True, "totalCount": 0, "data": []})
        cache = MemoryCache()
        service = banner.service(cache)
        await service.search(FILTERS)
        await service.search(FILTERS)
        assert banner.paths().count("/searchResults/searchResults") == 2
        assert cache.values == {}

    async def test_an_unknown_instructor_is_looked_up_again(self):
        banner = FakeBanner()
        service = banner.service(MemoryCache())
        nobody = SearchFilters(term="202703", instructor="Nobody")
        await service.search(nobody)
        await service.search(nobody)
        assert banner.paths().count("/classSearch/get_instructor") == 2

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


class TestSearchFilters:
    async def test_code_lists_are_sent_comma_separated(self):
        banner = FakeBanner()
        await banner.service().search(
            SearchFilters(
                term="202703",
                attributes=("GA", "GW"),
                campuses=("MN", "CC"),
                instructional_methods=("OLL", "VIRT"),
                parts_of_term=("07A",),
            )
        )
        sent = banner.requests[-1].url.params
        assert sent["txt_attribute"] == "GA,GW"
        assert sent["txt_campus"] == "MN,CC"
        assert sent["txt_instructionalMethod"] == "OLL,VIRT"
        assert sent["txt_partOfTerm"] == "07A"

    @pytest.mark.parametrize(
        ("number_from", "number_to", "sent_from", "sent_to"),
        [
            ("3000", "4999", "3000", "4999"),
            # Banner compares as text: "999" would sort after "9063".
            ("0", "999", "0000", "0999"),
            ("5000", "", "5000", "9999"),
            ("", "1999", "0000", "1999"),
        ],
    )
    async def test_course_number_ranges_have_both_ends_in_four_digits(
        self, number_from, number_to, sent_from, sent_to
    ):
        banner = FakeBanner()
        await banner.service().search(
            SearchFilters(
                term="202703",
                subject="MATH",
                course_number_from=number_from,
                course_number_to=number_to,
            )
        )
        sent = banner.requests[-1].url.params
        assert sent["txt_course_number_range"] == sent_from
        assert sent["txt_course_number_range_to"] == sent_to

    async def test_no_range_sends_no_range(self):
        banner = FakeBanner()
        await banner.service().search(FILTERS)
        assert "txt_course_number_range" not in banner.requests[-1].url.params

    async def test_instructor_is_looked_up_in_the_search_session(self):
        banner = FakeBanner()
        await banner.service().search(
            SearchFilters(term="202703", instructor="nahed hamid")
        )
        assert banner.paths() == [
            "/term/search",
            "/classSearch/get_instructor",
            "/searchResults/searchResults",
        ]
        _, lookup, search = banner.requests
        assert lookup.url.params["searchTerm"] == "nahed"
        assert lookup.headers["cookie"] == search.headers["cookie"] == "JSESSIONID=s1"
        assert search.url.params["txt_instructor"] == "101"

    async def test_one_name_matches_every_instructor_with_it(self):
        banner = FakeBanner()
        await banner.service().search(SearchFilters(term="202703", instructor="Hamid"))
        assert banner.requests[-1].url.params["txt_instructor"] == "101,102,103"

    @pytest.mark.parametrize(
        ("typed", "looked_up", "codes"),
        [
            ("Nahed", "nahed", "101"),
            ("Hamid, Nahed", "hamid", "101"),
            ("N. Hamid", "hamid", "101"),
            # Banner's lookup finds nothing for "abdul-hamid" itself.
            ("Abdul-Hamid", "abdul", "103"),
        ],
    )
    async def test_names_are_matched_word_by_word(self, typed, looked_up, codes):
        banner = FakeBanner()
        await banner.service().search(SearchFilters(term="202703", instructor=typed))
        lookup = banner.requests[1]
        assert lookup.url.params["searchTerm"] == looked_up
        assert banner.requests[-1].url.params["txt_instructor"] == codes

    async def test_a_name_without_letters_finds_nothing(self):
        banner = FakeBanner()
        result = await banner.service().search(
            SearchFilters(term="202703", instructor="--")
        )
        assert result.total_count == 0
        assert banner.paths() == ["/term/search"]

    async def test_an_unknown_instructor_finds_nothing_without_searching(self):
        """An empty instructor filter would match every section in the term."""
        banner = FakeBanner()
        result = await banner.service().search(
            SearchFilters(term="202703", instructor="Nobody Here")
        )
        assert result.total_count == 0
        assert result.sections == []
        assert "/searchResults/searchResults" not in banner.paths()


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

    @pytest.mark.parametrize(
        ("lookup", "path", "code"),
        [
            ("campuses", "/classSearch/get_campus", "MN"),
            ("parts_of_term", "/classSearch/get_partOfTerm", "07A"),
        ],
    )
    async def test_term_lookups_are_cached_per_term(self, lookup, path, code):
        banner = FakeBanner()
        cache = MemoryCache()
        service = banner.service(cache)
        first = await getattr(service, lookup)("202703")
        await getattr(service, lookup)("202703")
        assert [item.code for item in first] == [code]
        assert banner.paths() == [path]
        assert banner.requests[0].url.params["term"] == "202703"
        assert list(cache.ttls.values()) == [LOOKUP_TTL_SECONDS]
