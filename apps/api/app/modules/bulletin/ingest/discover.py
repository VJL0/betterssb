"""Links out of a fetched page, tagged with how they were found.

The tag is what lets discovery methods be reconciled: a page reachable only
from the left-hand catalog tree, or listed in the sitemap but linked from
nowhere, is worth knowing about. CourseLeaf pages have stable regions:

- `#cl-menu`, the catalog-contents tree in the sidebar
- `#breadcrumb`
- `#contentarea`, the page body (and its tabs)
- `#header` / `#footer`, site chrome

Index pages override the content tag: links in `/academic-programs/` are the
program index, in the course indexes the course index, in `/sitemap/` the HTML
site map.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from urllib.parse import urlsplit
from xml.etree import ElementTree

from lxml import etree, html

from app.modules.bulletin.ingest.urls import BULLETIN_HOST, normalize_url

SITEMAP_NAMESPACE = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
MAX_ANCHOR_TEXT = 300

REGION_METHODS = (
    ("cl-menu", "catalog_navigation"),
    ("breadcrumb", "breadcrumb"),
    ("contentarea", "content_link"),
    ("header", "site_chrome"),
    ("footer", "site_chrome"),
)
INDEX_PAGE_METHODS = {
    "/academic-programs/": "program_index",
    "/courses/": "course_index",
    "/undergraduate/courses/": "course_index",
    "/graduate/courses/": "course_index",
    "/sitemap/": "sitemap_page",
}
FRAME_SOURCES = "//frame[@src] | //iframe[@src]"


@dataclass(frozen=True, slots=True)
class Link:
    url: str
    method: str
    anchor_text: str


@dataclass(slots=True)
class PageLinks:
    title: str | None
    canonical_url: str | None
    links: list[Link] = field(default_factory=list)


def _clean(text: str) -> str:
    return " ".join(text.split())[:MAX_ANCHOR_TEXT]


def parse_document(body: bytes) -> html.HtmlElement | None:
    try:
        return html.document_fromstring(body)
    except etree.ParserError, ValueError:
        return None


def page_links(body: bytes, page_url: str) -> PageLinks:
    document = parse_document(body)
    if document is None:
        return PageLinks(None, None)
    base = page_url
    if base_href := document.xpath("//base/@href"):
        base = normalize_url(base_href[0], page_url) or page_url
    title = document.findtext(".//title")
    canonical = document.xpath('//link[@rel="canonical"]/@href')
    result = PageLinks(
        _clean(title) if title else None,
        normalize_url(canonical[0], base) if canonical else None,
    )
    parts = urlsplit(page_url)
    content_method = (
        INDEX_PAGE_METHODS.get(parts.path, "content_link")
        if parts.hostname == BULLETIN_HOST
        else "html_link"
    )
    # Elements, not id()s: lxml makes a new proxy per query unless one is alive.
    tagged: set[html.HtmlElement] = set()
    for region, method in REGION_METHODS:
        if region == "contentarea":
            method = content_method
        for anchor in document.xpath(f'//*[@id="{region}"]//a[@href]'):
            tagged.add(anchor)
            _add(result, anchor.get("href"), base, method, anchor.text_content())
    for anchor in document.xpath("//a[@href] | //area[@href]"):
        if anchor not in tagged:
            _add(result, anchor.get("href"), base, "html_link", anchor.text_content())
    for frame in document.xpath(FRAME_SOURCES):
        _add(result, frame.get("src"), base, "frame", "")
    if result.canonical_url:
        result.links.append(Link(result.canonical_url, "canonical", ""))
    return result


def _add(
    result: PageLinks, href: str | None, base: str, method: str, text: str
) -> None:
    if href and (url := normalize_url(href, base)):
        result.links.append(Link(url, method, _clean(text)))


def sitemap_locations(body: bytes) -> list[str]:
    root = ElementTree.fromstring(body)
    return [
        url
        for loc in root.iterfind("sm:url/sm:loc", SITEMAP_NAMESPACE)
        if loc.text and (url := normalize_url(loc.text))
    ]
