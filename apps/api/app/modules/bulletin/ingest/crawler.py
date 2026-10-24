"""A polite crawler for the current Bulletin edition.

It starts from the sitemap, keeps to undergraduate pages, follows links only
within that scope, asks `robots.txt` before every request and stops if it can't
read it. Temple's `robots.txt` disallows `/archives/`, so earlier editions come
from their PDFs or an existing capture instead.
"""

from __future__ import annotations

import logging
import time
from collections import deque
from pathlib import Path
from urllib.parse import urldefrag, urljoin, urlsplit
from urllib.robotparser import RobotFileParser
from xml.etree import ElementTree

import httpx
from bs4 import BeautifulSoup

from app.modules.bulletin.ingest.capture import CaptureWriter

logger = logging.getLogger(__name__)

BULLETIN_ORIGIN = "https://bulletin.temple.edu"
SITEMAP_URL = f"{BULLETIN_ORIGIN}/sitemap.xml"
ROBOTS_URL = f"{BULLETIN_ORIGIN}/robots.txt"
USER_AGENT = "BetterSSB-Bulletin-Ingest/1.0 (+https://github.com/VJL0/betterssb)"
SITEMAP_NAMESPACE = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}

# The undergraduate catalog, plus the two top-level pages that index and explain it.
IN_SCOPE_PREFIXES = ("/undergraduate/",)
IN_SCOPE_PAGES = {"/academic-programs/", "/about-courses/"}

SECONDS_BETWEEN_REQUESTS = 1.0
REQUEST_TIMEOUT_SECONDS = 30.0
MAX_PAGES = 5000


class RobotsUnavailableError(RuntimeError):
    """robots.txt couldn't be read, so no crawling permission is assumed."""


def normalize_url(url: str) -> str:
    without_fragment, _ = urldefrag(url)
    return without_fragment.split("?", 1)[0]


def is_in_scope(url: str) -> bool:
    parts = urlsplit(url)
    if f"{parts.scheme}://{parts.netloc}" != BULLETIN_ORIGIN:
        return False
    if parts.path.endswith(".pdf"):
        return False
    return parts.path in IN_SCOPE_PAGES or parts.path.startswith(IN_SCOPE_PREFIXES)


def sitemap_urls(sitemap_xml: bytes) -> list[str]:
    root = ElementTree.fromstring(sitemap_xml)
    return [
        normalize_url(loc.text.strip())
        for loc in root.iterfind("sm:url/sm:loc", SITEMAP_NAMESPACE)
        if loc.text
    ]


def page_links(html: str, base_url: str) -> list[str]:
    soup = BeautifulSoup(html, "lxml")
    return [
        normalize_url(urljoin(base_url, anchor["href"]))
        for anchor in soup.find_all("a", href=True)
    ]


class Crawler:
    def __init__(self, client: httpx.Client, robots: RobotFileParser) -> None:
        self.client = client
        self.robots = robots
        self.last_request_at = 0.0

    @classmethod
    def connect(cls, client: httpx.Client) -> Crawler:
        response = client.get(ROBOTS_URL)
        if response.status_code != 200:
            raise RobotsUnavailableError(
                f"{ROBOTS_URL} returned HTTP {response.status_code}"
            )
        robots = RobotFileParser(ROBOTS_URL)
        robots.parse(response.text.splitlines())
        return cls(client, robots)

    def allowed(self, url: str) -> bool:
        return self.robots.can_fetch(USER_AGENT, url)

    def fetch(self, url: str) -> httpx.Response:
        wait = self.last_request_at + SECONDS_BETWEEN_REQUESTS - time.monotonic()
        if wait > 0:
            time.sleep(wait)
        try:
            return self.client.get(url)
        finally:
            self.last_request_at = time.monotonic()

    def crawl(self, writer: CaptureWriter) -> int:
        """Capture every in-scope page not captured yet; return how many."""
        seen = writer.captured_urls()
        queue = deque(
            url
            for url in sitemap_urls(self.fetch(SITEMAP_URL).content)
            if is_in_scope(url)
        )
        queued = set(queue)
        captured = 0
        while queue and captured < MAX_PAGES:
            url = queue.popleft()
            if url in seen or not self.allowed(url):
                continue
            response = self.fetch(url)
            content_type = response.headers.get("content-type", "")
            result = writer.write(
                url, response.status_code, content_type, response.content
            )
            seen.add(url)
            captured += 1
            if captured % 50 == 0:
                logger.info("Captured %d pages, %d queued", captured, len(queue))
            if not result.is_html:
                logger.warning("HTTP %d for %s", response.status_code, url)
                continue
            for link in page_links(result.read_text(), url):
                if link not in queued and is_in_scope(link):
                    queued.add(link)
                    queue.append(link)
        return captured


def crawl_current_edition(directory: Path) -> int:
    with httpx.Client(
        headers={"User-Agent": USER_AGENT},
        timeout=REQUEST_TIMEOUT_SECONDS,
        follow_redirects=True,
    ) as client:
        return Crawler.connect(client).crawl(CaptureWriter(directory))
