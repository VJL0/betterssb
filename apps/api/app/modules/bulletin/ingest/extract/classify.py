"""What kind of page a snapshot is, from its path within the edition and its
CourseLeaf structure.

The signals come from a census of the 2026-2027 crawl and the 2024-2025
capture: course listings hold `div.courseblock`s under a `courses/` path;
program pages have a Requirements tab (`requirementstextcontainer` for
undergraduate, `programrequirementstextcontainer` for graduate) or print a
Program Code; school and college pages have a Programs tab; policy and
General Education pages sit under their own paths.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from urllib.parse import urlsplit

from lxml import html

from app.modules.bulletin.ingest.urls import ARCHIVE_PATH, BULLETIN_HOST


class PageKind(StrEnum):
    HOME = "home"
    SITEMAP = "sitemap"
    PROGRAM_INDEX = "program_index"
    COURSE_INDEX = "course_index"
    COURSE_LISTING = "course_listing"
    PROGRAM = "program"
    ACADEMIC_UNIT = "academic_unit"
    GENERAL_EDUCATION = "general_education"
    POLICY = "policy"
    PROGRAM_LIST = "program_list"
    INFORMATION = "information"
    FACULTY = "faculty"
    LEGACY = "legacy"
    OTHER = "other"


PROGRAM_TABS = frozenset(
    {"requirementstextcontainer", "programrequirementstextcontainer"}
)
UNIT_TABS = frozenset(
    {
        "programstextcontainer",
        "graduateprogramstextcontainer",
        "professionalprogramtextcontainer",
    }
)
POLICY_PREFIXES = (
    "/undergraduate/academic-policies/",
    "/graduate/graduate-policies/",
    "/undergraduate/student-resources/student-rights-responsibilities/",
    "/graduate/grad-student-rights-responsibilities/",
)
GENED_PREFIX = "/undergraduate/general-education/"
# Pages that list programs of one kind across colleges.
PROGRAM_LIST_PATHS = frozenset(
    {
        "/undergraduate/accelerated-degree-programs/",
        "/undergraduate/intercollegial-programs/",
        "/undergraduate/certificates-non-credit-programs/",
        "/undergraduate/university-honors-program/",
        "/undergraduate/schools-colleges/",
        "/graduate/scd/",
    }
)
COURSE_INDEX_PATHS = frozenset(
    {"/courses/", "/undergraduate/courses/", "/graduate/courses/", "/about-courses/"}
)


@dataclass(frozen=True, slots=True)
class PageSignals:
    path: str
    tab_ids: frozenset[str]
    has_course_blocks: bool
    has_course_lists: bool
    has_plan_grids: bool
    prints_program_code: bool


def edition_path(url: str) -> str:
    """The page's path within its edition: archives' `/archives/YYYY-YYYY` prefix
    is dropped so every edition's pages classify alike."""
    parts = urlsplit(url)
    path = parts.path or "/"
    if parts.hostname == BULLETIN_HOST and (match := ARCHIVE_PATH.match(path)):
        path = path[match.end() - 1 :]
    return path if path.endswith("/") or "." in path.rsplit("/", 1)[-1] else path + "/"


def page_signals(document: html.HtmlElement, url: str) -> PageSignals:
    return PageSignals(
        path=edition_path(url),
        tab_ids=frozenset(document.xpath('//*[@id="tabs"]//a/@aria-controls')),
        has_course_blocks=bool(document.xpath('//div[contains(@class,"courseblock")]')),
        has_course_lists=bool(
            document.xpath('//table[contains(@class,"sc_courselist")]')
        ),
        has_plan_grids=bool(document.xpath('//table[contains(@class,"sc_plangrid")]')),
        prints_program_code="Program Code:"
        in document.xpath('string(//*[@id="contentarea"])'),
    )


def classify_page(url: str, signals: PageSignals) -> PageKind:
    if urlsplit(url).hostname != BULLETIN_HOST:
        return PageKind.LEGACY
    path = signals.path
    segments = [segment for segment in path.split("/") if segment]
    if path == "/":
        return PageKind.HOME
    if path in {"/sitemap/", "/sitemap.xml"}:
        return PageKind.SITEMAP
    if path == "/academic-programs/":
        return PageKind.PROGRAM_INDEX
    if path in COURSE_INDEX_PATHS:
        return PageKind.COURSE_INDEX
    if "courses" in segments and signals.has_course_blocks:
        return PageKind.COURSE_LISTING
    if path == "/faculty/":
        return PageKind.FACULTY
    if path.startswith(GENED_PREFIX):
        return PageKind.GENERAL_EDUCATION
    if path.startswith(POLICY_PREFIXES):
        return PageKind.POLICY
    if path in PROGRAM_LIST_PATHS:
        return PageKind.PROGRAM_LIST
    if signals.tab_ids & UNIT_TABS:
        return PageKind.ACADEMIC_UNIT
    if signals.tab_ids & PROGRAM_TABS or signals.prints_program_code:
        return PageKind.PROGRAM
    if _is_program_path(segments) and (
        signals.has_course_lists or signals.has_plan_grids
    ):
        return PageKind.PROGRAM
    return PageKind.INFORMATION


def _is_program_path(segments: list[str]) -> bool:
    """`/undergraduate/<college>/<program>/` or `/graduate/scd/<school>/<program>/`."""
    if segments[:1] == ["undergraduate"]:
        return len(segments) >= 3
    return segments[:2] == ["graduate", "scd"] and len(segments) >= 4
