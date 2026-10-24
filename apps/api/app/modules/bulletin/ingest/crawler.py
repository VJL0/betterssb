"""Discovery and fetching: from seeds to a complete, resumable URL inventory.

Each round fetches every pending URL, one worker per host (the fetcher paces
each host), records every link found, and queues the eligible new ones. It
stops when a round finds nothing new: the frontier is exhausted, and every URL
seen has an outcome (fetched, failed, excluded with a reason, or blocked by
robots.txt).
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections import defaultdict
from dataclasses import dataclass
from urllib.parse import urlsplit

from app.modules.bulletin.ingest.crawl_state import (
    CrawlState,
    FetchRecord,
    UrlStatus,
    utc_now,
)
from app.modules.bulletin.ingest.discover import page_links, sitemap_locations
from app.modules.bulletin.ingest.fetcher import USER_AGENT, FetchResult, PoliteFetcher
from app.modules.bulletin.ingest.robots import ROBOTS_PATH, HostRules, parse_rules
from app.modules.bulletin.ingest.store import ObjectStore
from app.modules.bulletin.ingest.urls import (
    BULLETIN_HOST,
    LEGACY_HOST,
    classify_url,
    normalize_url,
)

logger = logging.getLogger(__name__)

HTTP_OK = 200
COMMIT_EVERY = 25

# The current edition's entry points. /archives/ is left out: robots.txt
# disallows it.
CURRENT_SEEDS = (
    "/",
    "/sitemap/",
    "/sitemap.xml",
    "/academic-programs/",
    "/courses/",
    "/about-courses/",
    "/undergraduate/",
    "/undergraduate/courses/",
    "/undergraduate/schools-colleges/",
    "/undergraduate/general-education/",
    "/undergraduate/writing-intensive-courses/",
    "/undergraduate/academic-policies/",
    "/undergraduate/accelerated-degree-programs/",
    "/undergraduate/intercollegial-programs/",
    "/undergraduate/certificates-non-credit-programs/",
    "/undergraduate/university-honors-program/",
    "/undergraduate/student-resources/",
    "/graduate/",
    "/graduate/courses/",
    "/graduate/scd/",
    "/graduate/graduate-policies/",
)

# Roots of the legacy editions, as the 2024-2025 archive index links them.
LEGACY_SEEDS = tuple(
    [f"/bulletin/archive/webarchive/bulletin{year}/" for year in range(2004, 2014)]
    + [
        "/gradarchives/00_01/bulletin/index.html",
        "/gradarchives/01_02/bulletin.asp",
        "/gradarchives/02_03/bulletin.asp",
        "/gradarchives/03-05/",
        "/gradarchives/05-06/gradbulletin/",
        "/gradarchives/06-07/",
        "/gradarchives/07-08/",
        "/gradarchives/08-09/",
        "/gradarchives/09-10/",
        "/gradarchives/10-11/",
        "/gradarchives/11-12/",
        "/gradarchives/12-13/",
        "/gradarchives/13-14/",
    ]
)


def current_seed_urls() -> list[str]:
    return [f"https://{BULLETIN_HOST}{path}" for path in CURRENT_SEEDS]


def legacy_seed_urls() -> list[str]:
    return [f"https://{LEGACY_HOST}{path}" for path in LEGACY_SEEDS]


def is_html(content_type: str) -> bool:
    return content_type.startswith(("text/html", "application/xhtml"))


def is_xml(content_type: str, url: str) -> bool:
    return url.endswith(".xml") or ("xml" in content_type and not is_html(content_type))


@dataclass(slots=True)
class CrawlSummary:
    rounds: int = 0
    fetched: int = 0
    not_modified: int = 0
    failed: int = 0
    blocked: int = 0
    discovered: int = 0


class Crawler:
    def __init__(
        self,
        state: CrawlState,
        store: ObjectStore,
        fetcher: PoliteFetcher,
        hosts: frozenset[str],
        max_rounds: int | None = None,
    ) -> None:
        self.state = state
        self.store = store
        self.fetcher = fetcher
        self.hosts = hosts
        self.max_rounds = max_rounds
        self.rules: dict[str, HostRules] = {}
        self.summary = CrawlSummary()
        self.since_commit = 0

    def seed(self, urls: list[str], method: str = "seed") -> None:
        for url in urls:
            if normalized := normalize_url(url):
                self.state.record_url(classify_url(normalized), method)
        self.state.commit()

    async def load_robots(self) -> None:
        """Read every host's robots.txt before anything else is requested."""
        for host in sorted(self.hosts):
            url = f"https://{host}{ROBOTS_PATH}"
            result = await self.fetcher.fetch(url, lambda _: True)
            body = (result.body or b"").decode("utf-8", errors="replace")
            self.state.save_robots(host, result.status, body)
            self.rules[host] = parse_rules(host, result.status, body)
            if not self.rules[host].readable:
                logger.warning(
                    "robots.txt for %s unreadable (%s); nothing there will be fetched",
                    host,
                    result.status or result.error,
                )
        self.state.commit()

    def may_fetch(self, url: str) -> bool:
        host = urlsplit(url).hostname or ""
        rules = self.rules.get(host)
        return (
            host in self.hosts
            and rules is not None
            and rules.allows(USER_AGENT, url)
            and classify_url(url).eligible
        )

    async def run(self, max_pages: int | None = None) -> CrawlSummary:
        await self.load_robots()
        budget = max_pages
        while True:
            if self.max_rounds is not None and self.summary.rounds >= self.max_rounds:
                break
            pending = self.state.pending(self.hosts)
            if budget is not None:
                pending = pending[: max(budget, 0)]
            if not pending:
                break
            self.summary.rounds += 1
            logger.info("Round %d: %d URLs", self.summary.rounds, len(pending))
            by_host: dict[str, list] = defaultdict(list)
            for row in pending:
                by_host[urlsplit(row["url"]).hostname or ""].append(row)
            await asyncio.gather(*(self._work(rows) for rows in by_host.values()))
            self.state.commit()
            if budget is not None:
                budget -= len(pending)
                if budget <= 0:
                    break
        self.state.commit()
        return self.summary

    async def _work(self, rows: list) -> None:
        for row in rows:
            await self._process(row)
            self.since_commit += 1
            if self.since_commit >= COMMIT_EVERY:
                self.state.commit()
                self.since_commit = 0

    async def _process(self, row) -> None:
        url = row["url"]
        host = urlsplit(url).hostname or ""
        rules = self.rules.get(host)
        if rules is None or not rules.allows(USER_AGENT, url):
            self.state.mark_blocked(url, "robots.txt disallows or is unreadable")
            self.summary.blocked += 1
            return
        result = await self.fetcher.fetch(
            url, self.may_fetch, row["etag"], row["last_modified"]
        )
        sha256 = None
        if result.status == HTTP_OK and result.body is not None and not result.error:
            sha256 = self.store.put(result.body)
        self.state.log_attempt(
            url,
            result.conditional,
            result.status,
            result.final_url,
            sha256,
            result.elapsed_ms,
            result.error,
        )
        self.state.record_fetch(url, self._record(result, sha256))
        if sha256 is None:
            if result.not_modified:
                self.summary.not_modified += 1
            else:
                self.summary.failed += 1
                logger.warning("%s: %s", url, result.error or result.status)
            return
        self.summary.fetched += 1
        self._discover(url, result, row["depth"])

    @staticmethod
    def _record(result: FetchResult, sha256: str | None) -> FetchRecord:
        if result.not_modified:
            status = UrlStatus.NOT_MODIFIED
        elif sha256 is not None:
            status = UrlStatus.FETCHED
        else:
            status = UrlStatus.FAILED
        return FetchRecord(
            status=status,
            http_status=result.status,
            final_url=result.final_url,
            redirect_chain=result.redirect_chain,
            content_type=result.content_type or None,
            sha256=sha256,
            size=len(result.body) if result.body is not None else None,
            etag=result.headers.get("etag"),
            last_modified=result.headers.get("last-modified"),
            error=result.error,
            fetched_at=utc_now(),
        )

    def _discover(self, url: str, result: FetchResult, depth: int) -> None:
        assert result.body is not None
        if result.final_url != url and (target := normalize_url(result.final_url)):
            self._found(url, target, "redirect", "", depth)
        if is_html(result.content_type):
            links = page_links(result.body, result.final_url)
            self.state.set_page_facts(url, links.title, links.canonical_url)
            for link in links.links:
                self._found(url, link.url, link.method, link.anchor_text, depth)
        elif is_xml(result.content_type, url):
            for location in sitemap_locations(result.body):
                self._found(url, location, "sitemap_xml", "", depth)

    def _found(
        self, source: str, target: str, method: str, anchor: str, depth: int
    ) -> None:
        if target == source:
            return
        self.state.record_link(source, target, method, anchor)
        if self.state.record_url(classify_url(target), method, source, depth + 1):
            self.summary.discovered += 1


# Methods that record a URL without a link pointing at it.
NON_LINK_METHODS = frozenset({"seed", "targeted", "prior_capture", "manual_download"})


def rebuild_link_graph(state: CrawlState, store: ObjectStore) -> int:
    """Re-derive every link and discovery method from stored snapshots.

    Offline: after a change to link extraction, the graph is rebuilt from the
    bytes already held instead of crawling again. Returns the link count.
    """
    state.db.execute("DELETE FROM links")
    for row in state.fetched():
        body = store.get(row["sha256"])
        url, content_type = row["url"], row["content_type"] or ""
        final_url = row["final_url"] or url
        if final_url != url:
            state.record_link(url, final_url, "redirect", "")
            state.record_url(classify_url(final_url), "redirect", url, row["depth"] + 1)
        if is_html(content_type):
            links = page_links(body, final_url)
            state.set_page_facts(url, links.title, links.canonical_url)
            found = [(link.url, link.method, link.anchor_text) for link in links.links]
        elif is_xml(content_type, url):
            found = [(loc, "sitemap_xml", "") for loc in sitemap_locations(body)]
        else:
            continue
        for target, method, anchor in found:
            if target != url:
                state.record_link(url, target, method, anchor)
                state.record_url(classify_url(target), method, url, row["depth"] + 1)
    methods_by_url: dict[str, set[str]] = defaultdict(set)
    for to_url, method in state.db.execute("SELECT to_url, method FROM links"):
        methods_by_url[to_url].add(method)
    for row in state.rows():
        kept = set(json.loads(row["discovered_via"])) & NON_LINK_METHODS
        methods = sorted(kept | methods_by_url.get(row["url"], set()))
        state.db.execute(
            "UPDATE urls SET discovered_via = ? WHERE url = ?",
            (json.dumps(methods), row["url"]),
        )
    state.commit()
    return state.db.execute("SELECT count(*) FROM links").fetchone()[0]
