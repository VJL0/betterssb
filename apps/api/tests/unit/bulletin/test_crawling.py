from __future__ import annotations

import httpx
import pytest
from app.modules.bulletin.ingest.captures import import_file
from app.modules.bulletin.ingest.crawl_state import CrawlState, UrlStatus
from app.modules.bulletin.ingest.crawler import Crawler
from app.modules.bulletin.ingest.discover import page_links, sitemap_locations
from app.modules.bulletin.ingest.fetcher import PoliteFetcher, retry_after_seconds
from app.modules.bulletin.ingest.manifest import export_manifest, mark_duplicates
from app.modules.bulletin.ingest.robots import parse_rules
from app.modules.bulletin.ingest.store import ObjectStore, sha256_hex
from app.modules.bulletin.ingest.urls import (
    Level,
    Scope,
    classify_url,
    legacy_edition,
    normalize_url,
)

TEMPLE_ROBOTS = """Sitemap: https://bulletin.temple.edu/sitemap.xml
User-agent: *
Disallow: /archives/
Disallow: /search/
Disallow: /pdf/
"""


class TestNormalizeUrl:
    def test_resolves_relative_links_and_drops_fragments(self):
        assert (
            normalize_url("../cis/#text", "https://bulletin.temple.edu/courses/math/")
            == "https://bulletin.temple.edu/courses/cis/"
        )

    def test_upgrades_temple_hosts_to_https(self):
        assert (
            normalize_url("http://www.temple.edu/gradarchives/13-14/")
            == "https://www.temple.edu/gradarchives/13-14/"
        )

    def test_trims_whitespace_the_2024_archive_left_in_an_href(self):
        url = normalize_url(
            "34-podiatry/ ", "https://bulletin.temple.edu/undergraduate/x/"
        )
        assert url == "https://bulletin.temple.edu/undergraduate/x/34-podiatry/"

    @pytest.mark.parametrize("href", ["mailto:a@temple.edu", "javascript:void(0)", ""])
    def test_ignores_non_http_links(self, href):
        assert normalize_url(href, "https://bulletin.temple.edu/") is None

    def test_keeps_query_strings(self):
        url = normalize_url(
            "bulletin.asp?page=2", "http://www.temple.edu/gradarchives/01_02/"
        )
        assert url == "https://www.temple.edu/gradarchives/01_02/bulletin.asp?page=2"


class TestClassifyUrl:
    def test_current_pages_are_eligible_with_their_level(self):
        info = classify_url("https://bulletin.temple.edu/graduate/scd/law/")
        assert info.eligible and info.scope is Scope.CURRENT
        assert info.edition == "2026-2027" and info.level is Level.GRADUATE

    def test_archives_are_recorded_but_not_fetched(self):
        info = classify_url(
            "https://bulletin.temple.edu/archives/2022-2023/undergraduate/"
        )
        assert not info.eligible and info.scope is Scope.ARCHIVE
        assert info.edition == "2022-2023" and info.level is Level.UNDERGRADUATE
        assert "robots.txt" in info.reason

    def test_full_volume_pdfs_are_not_fetched(self):
        info = classify_url("https://bulletin.temple.edu/pdf/2026-2027-graduate.pdf")
        assert not info.eligible and "/pdf/" in info.reason

    def test_page_print_exports_are_duplicates(self):
        info = classify_url(
            "https://bulletin.temple.edu/undergraduate/tyler/art-bfa/art-bfa.pdf"
        )
        assert not info.eligible and "duplicat" in info.reason

    def test_search_results_point_at_the_subject_page(self):
        info = classify_url("https://bulletin.temple.edu/search/?P=CIS%201068")
        assert not info.eligible and "/courses/cis/" in info.reason

    def test_legacy_archives_are_eligible(self):
        info = classify_url(
            "https://www.temple.edu/bulletin/archive/webarchive/bulletin2009/index.htm"
        )
        assert info.eligible and info.scope is Scope.LEGACY
        assert info.edition == "2009-2010" and info.level is Level.UNDERGRADUATE

    def test_other_temple_pages_are_external(self):
        info = classify_url("https://www.temple.edu/academics")
        assert not info.eligible and info.scope is Scope.EXTERNAL

    @pytest.mark.parametrize(
        ("path", "edition"),
        [
            ("/gradarchives/00_01/bulletin/index.html", "2000-2001"),
            ("/gradarchives/03-05/", "2003-2005"),
            ("/gradarchives/13-14/grad/index.htm", "2013-2014"),
        ],
    )
    def test_graduate_legacy_editions(self, path, edition):
        assert legacy_edition(path) == (edition, Level.GRADUATE)


class TestRobots:
    def test_disallowed_paths(self):
        rules = parse_rules("bulletin.temple.edu", 200, TEMPLE_ROBOTS)
        assert rules.allows("bot", "https://bulletin.temple.edu/courses/cis/")
        assert not rules.allows(
            "bot", "https://bulletin.temple.edu/archives/2024-2025/"
        )

    def test_unreadable_robots_allows_nothing(self):
        rules = parse_rules("bulletin.temple.edu", 503, "")
        assert not rules.allows("bot", "https://bulletin.temple.edu/")

    def test_missing_robots_allows_everything(self):
        rules = parse_rules("www.temple.edu", 404, "")
        assert rules.allows("bot", "https://www.temple.edu/gradarchives/13-14/")


class TestObjectStore:
    def test_round_trips_and_deduplicates(self, tmp_path):
        store = ObjectStore(tmp_path)
        key = store.put(b"<html>same</html>")
        assert (
            store.put(b"<html>same</html>") == key == sha256_hex(b"<html>same</html>")
        )
        assert store.get(key) == b"<html>same</html>"
        assert len(list(tmp_path.rglob("*.zst"))) == 1

    def test_detects_corruption(self, tmp_path):
        store = ObjectStore(tmp_path)
        key = store.put(b"original")
        other = ObjectStore(tmp_path / "other")
        store.path(key).write_bytes(other.path(other.put(b"tampered")).read_bytes())
        with pytest.raises(ValueError, match="corrupt"):
            store.get(key)


COURSELEAF_PAGE = b"""<html><head><title>Computer Science BS | Temple</title></head>
<body>
<header id="header"><a href="/">Home</a></header>
<nav id="breadcrumb"><a href="/undergraduate/">Undergraduate</a></nav>
<aside id="sidebar"><nav id="cl-menu"><a href="/undergraduate/science-technology/">CST</a></nav></aside>
<main id="contentarea">
  <a href="/courses/cis/">CIS courses</a>
  <a href="/search/?P=CIS%201068" class="bubblelink code">CIS 1068</a>
  <a href="mailto:advising@temple.edu">Email</a>
</main>
</body></html>"""


class TestPageLinks:
    def test_tags_links_by_page_region(self):
        links = page_links(
            COURSELEAF_PAGE,
            "https://bulletin.temple.edu/undergraduate/science-technology/computer-science-bs/",
        )
        methods = {link.url: link.method for link in links.links}
        assert links.title == "Computer Science BS | Temple"
        assert methods["https://bulletin.temple.edu/"] == "site_chrome"
        assert methods["https://bulletin.temple.edu/undergraduate/"] == "breadcrumb"
        assert (
            methods["https://bulletin.temple.edu/undergraduate/science-technology/"]
            == "catalog_navigation"
        )
        assert methods["https://bulletin.temple.edu/courses/cis/"] == "content_link"
        assert not any(url.startswith("mailto") for url in methods)

    def test_program_index_links_are_tagged_as_the_index(self):
        links = page_links(
            COURSELEAF_PAGE, "https://bulletin.temple.edu/academic-programs/"
        )
        methods = {link.url: link.method for link in links.links}
        assert methods["https://bulletin.temple.edu/courses/cis/"] == "program_index"

    def test_sitemap_locations(self):
        xml = b"""<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url><loc>https://bulletin.temple.edu/courses/cis/</loc></url>
        <url><loc>http://bulletin.temple.edu/graduate/</loc></url></urlset>"""
        assert sitemap_locations(xml) == [
            "https://bulletin.temple.edu/courses/cis/",
            "https://bulletin.temple.edu/graduate/",
        ]


class TestRetryAfter:
    def test_seconds_and_dates(self):
        assert retry_after_seconds("7") == 7.0
        assert retry_after_seconds("Wed, 21 Oct 2015 07:28:00 GMT") == 0.0
        assert retry_after_seconds("soon") is None


def fake_site(pages: dict[str, httpx.Response], calls: list[httpx.Request]):
    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return pages.get(str(request.url), httpx.Response(404, text="missing"))

    return httpx.MockTransport(handler)


@pytest.fixture()
def state(tmp_path):
    crawl_state = CrawlState(tmp_path / "crawl.sqlite3")
    yield crawl_state
    crawl_state.close()


def html_page(body: str, **headers: str) -> httpx.Response:
    return httpx.Response(
        200, text=body, headers={"content-type": "text/html; charset=UTF-8", **headers}
    )


class TestCrawler:
    async def crawl(self, state, tmp_path, pages, calls, refresh=False):
        async with httpx.AsyncClient(transport=fake_site(pages, calls)) as client:
            crawler = Crawler(
                state,
                ObjectStore(tmp_path / "objects"),
                PoliteFetcher(client, min_interval=0),
                frozenset({"bulletin.temple.edu"}),
            )
            if refresh:
                state.requeue_fetched()
            crawler.seed(["https://bulletin.temple.edu/"])
            return await crawler.run()

    async def test_crawls_to_exhaustion_and_respects_robots(self, state, tmp_path):
        calls: list[httpx.Request] = []
        pages = {
            "https://bulletin.temple.edu/robots.txt": httpx.Response(
                200, text=TEMPLE_ROBOTS
            ),
            "https://bulletin.temple.edu/": html_page(
                '<a href="/courses/">Courses</a><a href="/archives/2024-2025/">Old</a>'
                '<a href="https://www.temple.edu/">Temple</a>'
            ),
            "https://bulletin.temple.edu/courses/": html_page(
                '<a href="/courses/cis/">CIS</a><a href="/courses/gone/">Gone</a>'
            ),
            "https://bulletin.temple.edu/courses/cis/": html_page(
                "<p>CIS 1068</p>", etag='"v1"'
            ),
        }
        summary = await self.crawl(state, tmp_path, pages, calls)

        requested = {str(call.url) for call in calls}
        assert "https://bulletin.temple.edu/archives/2024-2025/" not in requested
        assert "https://www.temple.edu/" not in requested
        assert summary.fetched == 3 and summary.failed == 1
        assert (
            state.get("https://bulletin.temple.edu/courses/gone/")["http_status"] == 404
        )
        archive = state.get("https://bulletin.temple.edu/archives/2024-2025/")
        assert archive["status"] == UrlStatus.EXCLUDED
        assert state.pending() == []

    async def test_refresh_uses_conditional_requests(self, state, tmp_path):
        calls: list[httpx.Request] = []
        pages = {
            "https://bulletin.temple.edu/robots.txt": httpx.Response(
                200, text=TEMPLE_ROBOTS
            ),
            "https://bulletin.temple.edu/": html_page(
                '<a href="/courses/cis/">CIS</a>'
            ),
            "https://bulletin.temple.edu/courses/cis/": html_page(
                "<p>v1</p>", etag='"v1"'
            ),
        }
        await self.crawl(state, tmp_path, pages, calls)
        pages["https://bulletin.temple.edu/courses/cis/"] = httpx.Response(304)
        calls.clear()
        summary = await self.crawl(state, tmp_path, pages, calls, refresh=True)

        cis = next(c for c in calls if c.url.path == "/courses/cis/")
        assert cis.headers["if-none-match"] == '"v1"'
        assert summary.not_modified == 1
        row = state.get("https://bulletin.temple.edu/courses/cis/")
        assert row["status"] == UrlStatus.NOT_MODIFIED and row["sha256"]

    async def test_retries_server_errors(self, state, tmp_path):
        calls: list[httpx.Request] = []
        responses = iter([httpx.Response(503), html_page("<p>ok</p>")])
        pages = {
            "https://bulletin.temple.edu/robots.txt": httpx.Response(
                200, text=TEMPLE_ROBOTS
            ),
        }

        def handler(request: httpx.Request) -> httpx.Response:
            calls.append(request)
            if request.url.path == "/":
                return next(responses)
            return pages.get(str(request.url), httpx.Response(404))

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            fetcher = PoliteFetcher(client, min_interval=0)
            result = await fetcher.fetch("https://bulletin.temple.edu/", lambda _: True)
        assert result.status == 200 and result.body == b"<p>ok</p>"

    async def test_redirects_into_disallowed_paths_are_not_followed(
        self, state, tmp_path
    ):
        calls: list[httpx.Request] = []
        pages = {
            "https://bulletin.temple.edu/robots.txt": httpx.Response(
                200, text=TEMPLE_ROBOTS
            ),
            "https://bulletin.temple.edu/": httpx.Response(
                302, headers={"location": "/archives/2024-2025/"}
            ),
        }
        await self.crawl(state, tmp_path, pages, calls)
        assert all(not c.url.path.startswith("/archives/") for c in calls)
        row = state.get("https://bulletin.temple.edu/")
        assert row["status"] == UrlStatus.FAILED and "disallowed" in row["error"]


class TestManifest:
    def test_imported_files_and_duplicates(self, state, tmp_path):
        store = ObjectStore(tmp_path / "objects")
        pdf = tmp_path / "volume.pdf"
        pdf.write_bytes(b"%PDF-1.6 volume")
        import_file(
            state,
            store,
            pdf,
            "https://bulletin.temple.edu/pdf/2026-2027-undergraduate.pdf",
        )
        import_file(state, store, pdf, "https://bulletin.temple.edu/pdf/copy.pdf")

        assert mark_duplicates(state) == 1
        _jsonl, csv_path, count = export_manifest(state, tmp_path / "manifest")
        assert count == 2 and csv_path.exists()
        original = state.get(
            "https://bulletin.temple.edu/pdf/2026-2027-undergraduate.pdf"
        )
        assert original["status"] == UrlStatus.IMPORTED
        # Neither redirected, so the shorter URL is cited; the other points at it.
        assert original["duplicate_of"] == "https://bulletin.temple.edu/pdf/copy.pdf"


class TestPreferredUrl:
    def test_redirect_targets_and_trailing_slashes_win(self):
        from app.modules.bulletin.ingest.manifest import preferred_url_order

        alias = (
            "https://bulletin.temple.edu/x/finance-minor",
            "https://bulletin.temple.edu/x/finance-minor/",
        )
        canonical = ("https://bulletin.temple.edu/x/finance-minor/", None)
        index = ("https://bulletin.temple.edu/x/nursing-bsn/index.html", None)
        slash = ("https://bulletin.temple.edu/x/nursing-bsn/", None)
        assert (
            min([alias, canonical], key=lambda p: preferred_url_order(*p)) == canonical
        )
        assert min([index, slash], key=lambda p: preferred_url_order(*p)) == slash
