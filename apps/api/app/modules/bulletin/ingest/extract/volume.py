"""A full CourseLeaf PDF volume split back into the Bulletin pages it prints.

Some editions exist only as one PDF per level (2025-2026), and robots.txt keeps
every full volume from being crawled, so they arrive as manual files. This
turns such a volume into the same `EditionExtraction` the HTML extractor
produces, so `write_extraction`, `interpret` and `import` treat it like any
other edition.

Sections come from the volume's outline (PDF bookmarks): CourseLeaf writes one
bookmark per Bulletin page, nested as the site is (school › college ›
program), pointing just below the page's printed title. Each section runs from
its title to the next section's.

Page URLs: the volume prints its pages' content but not their URLs, so a
section's URL comes from another edition's page with the same title path (its
breadcrumbs), from the subject code for course listings, or from an explicit
override. The URL is the page's identity in this edition; the bytes are the
volume's, so every record carries the volume's SHA-256 and every passage its
page and bounding box (course, table and footnote evidence also keeps the
volume's URL). A section no rule maps keeps the volume URL with a
`#page=N&top=T` fragment and is reported, never guessed.
"""

from __future__ import annotations

import io
import re
from bisect import bisect_right
from collections import Counter, defaultdict
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field
from typing import Literal

from pdfminer.pdfdocument import PDFDocument, PDFNoOutlines
from pdfminer.pdfpage import PDFPage
from pdfminer.pdfparser import PDFParser
from pdfminer.pdftypes import resolve1
from pdfminer.psparser import PSLiteral

from app.modules.bulletin.ingest.extract import pdf
from app.modules.bulletin.ingest.extract.classify import (
    PageKind,
    PageSignals,
    classify_page,
    edition_path,
)
from app.modules.bulletin.ingest.extract.courses import (
    CourseRecord,
    UnparsedCourseBlock,
)
from app.modules.bulletin.ingest.extract.programs import LabeledFact, ProgramPage
from app.modules.bulletin.ingest.extract.run import (
    CourseEntry,
    EditionExtraction,
    ExtractedPage,
)
from app.modules.bulletin.ingest.extract.tables import CourseListTable
from app.modules.bulletin.ingest.records import (
    Block,
    Crumb,
    Evidence,
    Locator,
    PageDocument,
    Record,
    Tab,
)
from app.modules.bulletin.ingest.urls import BULLETIN_HOST, CURRENT_EDITION

# A bookmark points just below its title (26 pt for one line, more when the
# title wraps); the title's first line is looked for this far above it.
ANCHOR_WINDOW = 90.0
ANCHOR_SLACK = 10.0
MAX_TITLE_LINES = 3
EDITION_YEARS = re.compile(r"\b\d{4}\s*-\s*\d{4}\b")
NOT_WORD = re.compile(r"[^\w]+")
# "Statistics (STAT)": a course listing's subject code.
LISTING_SUBJECT = re.compile(r"\(([A-Z]{2,5})\)$")
# Overview facts: "Program Code: ST-CSCI-BS" printed with a bold label.
FACT_LABEL = re.compile(r"^[A-Z][^:]{0,58}:$")
PROGRAM_CODE_FACT = "Program Code:"
LEVEL_LISTINGS = ("/undergraduate/courses/", "/graduate/courses/")
LEVEL_ROOTS = ("/undergraduate/", "/graduate/")
# pdf_document's block kind for the running header (page number, volume
# title): volume furniture, not the page's content.
RUNNING_HEADER_KIND = "text"
HOME = Crumb(text="Home", url=f"https://{BULLETIN_HOST}/")
# The Overview tab: the interpreter reads its tables as beside the program
# (deficiency or honors courses), and they sit right under its label.
INTRODUCTORY_TABS = frozenset({"textcontainer"})

UrlBasis = Literal["reference", "course_code", "override", "volume_page"]
TitlePath = tuple[str, ...]
Position = tuple[int, float]
References = Mapping[TitlePath, frozenset[str]]


class OutlineEntry(Record):
    """One bookmark: its depth, title and where it points (1-based page,
    points from the page top)."""

    level: int
    title: str
    page: int
    top: float


class VolumeSection(Record):
    """A bookmark's span of the volume and the Bulletin page it reproduces."""

    titles: list[str]
    page: int
    top: float
    url: str
    # The page's path within an edition, when one of the rules found it.
    path: str | None
    basis: UrlBasis
    # A sub-heading bookmark with no page of its own, read as its parent's.
    merged_into: str | None = None


def normalized_title(title: str) -> str:
    """Titles as compared across editions: no years, "&" as "and", no
    punctuation or case ("Boyer College of Music & Dance")."""
    title = EDITION_YEARS.sub(" ", title).replace("&", " and ")
    return NOT_WORD.sub(" ", title).strip().casefold()


def title_key(titles: Iterable[str]) -> TitlePath:
    return tuple(normalized_title(title) for title in titles)


# Outline


def _destination(document: PDFDocument, dest, action) -> list | None:
    if action is not None:
        resolved = resolve1(action)
        dest = resolved.get("D") if isinstance(resolved, dict) else None
    dest = resolve1(dest)
    if isinstance(dest, (bytes, str)):
        dest = resolve1(document.get_dest(dest))
    if isinstance(dest, dict):
        dest = resolve1(dest.get("D"))
    return dest if isinstance(dest, list) and dest else None


def read_outline(body: bytes) -> list[OutlineEntry]:
    """The volume's bookmarks in document order; empty if it has none."""
    document = PDFDocument(PDFParser(io.BytesIO(body)))
    try:
        outlines = list(document.get_outlines())
    except PDFNoOutlines:
        return []
    pages = {
        page.pageid: (number, page.mediabox[3])
        for number, page in enumerate(PDFPage.create_pages(document), start=1)
    }
    entries = []
    for level, title, dest, action, _ in outlines:
        target = _destination(document, dest, action)
        if target is None or not hasattr(target[0], "objid"):
            continue
        page, height = pages.get(target[0].objid, (None, 0.0))
        if page is None:
            continue
        top = 0.0
        fit = target[1] if len(target) > 1 else None
        if isinstance(fit, PSLiteral) and fit.name == "XYZ" and len(target) > 3:
            y = resolve1(target[3])
            top = height - float(y) if y is not None else 0.0
        entries.append(OutlineEntry(level=level, title=title, page=page, top=top))
    return entries


# Page URLs


def reference_paths(
    *editions: Iterable[ExtractedPage],
) -> dict[TitlePath, frozenset[str]]:
    """Title path → the page paths other editions give it.

    The key is a page's breadcrumbs below Home, and again without the level
    root ("Undergraduate"), because volumes put the level's own pages beside
    the root rather than under it. Pass the nearest edition first: a title path
    it knows isn't looked up in later ones.
    """
    merged: dict[TitlePath, frozenset[str]] = {}
    for pages in editions:
        found: defaultdict[TitlePath, set[str]] = defaultdict(set)
        for page in pages:
            document = page.document
            crumbs = [crumb.text for crumb in document.breadcrumbs]
            titles = crumbs[1:] if crumbs[:1] == [HOME.text] else crumbs
            key = title_key(titles or [document.heading])
            path = edition_path(document.url)
            found[key].add(path)
            if len(key) > 1 and path.startswith(LEVEL_ROOTS):
                found[key[1:]].add(path)
        for key, paths in found.items():
            merged.setdefault(key, frozenset(paths))
    return merged


def tab_vocabulary(*editions: Iterable[ExtractedPage]) -> dict[str, str]:
    """Tab label → CourseLeaf's tab id ("Overview" → `textcontainer`), the
    most common pairing in other editions' pages. Volumes print a tab's label
    as a heading where the site shows the tab."""
    pairs: defaultdict[str, Counter[str]] = defaultdict(Counter)
    for pages in editions:
        for page in pages:
            for tab in page.document.tabs:
                pairs[normalized_title(tab.label)][tab.id] += 1
    return {label: ids.most_common(1)[0][0] for label, ids in pairs.items()}


def edition_url(edition: str, path: str) -> str:
    if edition == CURRENT_EDITION:
        return f"https://{BULLETIN_HOST}{path}"
    return f"https://{BULLETIN_HOST}/archives/{edition}{path}"


def volume_page_url(url: str, entry: OutlineEntry) -> str:
    """Where in the volume an unmapped section starts: its page, and the
    bookmark's height on it so two sections on one page stay distinct."""
    return f"{url}#page={entry.page}&top={round(entry.top)}"


def _resolve(candidates: frozenset[str], scope: str | None) -> str | None:
    """The one candidate path, preferring the volume's level ("About This
    Bulletin" exists under both /undergraduate/ and /graduate/)."""
    if scope is not None and len(candidates) > 1:
        candidates = (
            frozenset(p for p in candidates if p.startswith(scope)) or candidates
        )
    return next(iter(candidates)) if len(candidates) == 1 else None


def _volume_scope(outline: list[OutlineEntry], references: References) -> str | None:
    """The level root the volume prints ("/undergraduate/")."""
    for entry in outline:
        if entry.level == 1:
            candidates = references.get(title_key([entry.title]), frozenset())
            roots = candidates & set(LEVEL_ROOTS)
            if len(roots) == 1:
                return next(iter(roots))
    return None


def _course_listing_path(titles: list[str], parent_path: str | None) -> str | None:
    """`/undergraduate/courses/stat/` for "Statistics (STAT)" under a listing
    index: CourseLeaf names listings by subject code."""
    match = LISTING_SUBJECT.search(titles[-1])
    if match is None or parent_path is None or not parent_path.endswith("/courses/"):
        return None
    return f"{parent_path}{match[1].lower()}/"


def split_volume(
    outline: list[OutlineEntry],
    url: str,
    edition: str,
    references: References,
    overrides: Mapping[str, str] | None = None,
) -> list[VolumeSection]:
    """One section per bookmark, with the page it reproduces where known.

    `overrides` maps a title path joined with " › " to a page path, for
    sections no other rule maps."""
    overrides = overrides or {}
    scope = _volume_scope(outline, references)
    sections: list[VolumeSection] = []
    stack: list[str] = []
    paths_by_titles: dict[TitlePath, str | None] = {}
    for entry in outline:
        stack = [*stack[: entry.level - 1], entry.title]
        titles = list(stack)
        parent = paths_by_titles.get(tuple(titles[:-1]))
        joined = " › ".join(titles)
        basis: UrlBasis
        if joined in overrides:
            path, basis = overrides[joined], "override"
        elif path := _resolve(references.get(title_key(titles), frozenset()), scope):
            basis = "reference"
        elif path := _course_listing_path(titles, parent):
            basis = "course_code"
        else:
            path, basis = None, "volume_page"
        paths_by_titles[tuple(titles)] = path
        sections.append(
            VolumeSection(
                titles=titles,
                page=entry.page,
                top=entry.top,
                url=edition_url(edition, path) if path else volume_page_url(url, entry),
                path=path,
                basis=basis,
            )
        )
    return sections


# Positions


def _position(locator: Locator) -> Position:
    return (locator.page or 0, locator.bbox[1] if locator.bbox else 0.0)


def _line_position(line: pdf.Line) -> Position:
    # Rounded as locators' bounding boxes are, so a block and its first line
    # compare equal.
    return (line.page, round(line.top, 2))


def _anchor(
    section: VolumeSection, lines: list[pdf.Line], body_size: float
) -> Position:
    """Where the section's title is printed: the heading line(s) above the
    bookmark that read the same (long titles wrap onto two or three lines),
    else the bookmark itself."""
    wanted = normalized_title(section.titles[-1])
    page = [line for line in lines if line.page == section.page]
    for start, line in enumerate(page):
        if line.size <= body_size or not (
            section.top - ANCHOR_WINDOW <= line.top <= section.top + ANCHOR_SLACK
        ):
            continue
        run = page[start : start + MAX_TITLE_LINES]
        for count in range(1, len(run) + 1):
            if run[count - 1].size != line.size:
                break
            if normalized_title(" ".join(l.text for l in run[:count])) == wanted:
                return _line_position(line)
    return (section.page, round(section.top, 2))


class _Partition:
    """Which section a position falls in: the last anchor at or before it."""

    def __init__(self, anchors: list[Position]) -> None:
        order = sorted(range(len(anchors)), key=lambda i: anchors[i])
        self._positions = [anchors[i] for i in order]
        self._sections = order

    def of(self, position: Position) -> int | None:
        index = bisect_right(self._positions, position) - 1
        return self._sections[index] if index >= 0 else None


# Section content


@dataclass(slots=True)
class _Content:
    blocks: list[Block] = field(default_factory=list)
    lines: list[pdf.Line] = field(default_factory=list)
    tables: list[CourseListTable] = field(default_factory=list)

    def extend(self, other: _Content) -> None:
        self.blocks += other.blocks
        self.lines += other.lines
        self.tables += other.tables


def _contents(
    sections: list[VolumeSection],
    text: pdf.PdfText,
    document: PageDocument,
    tables: list[CourseListTable],
) -> list[_Content]:
    lines = pdf._content(text.lines)
    partition = _Partition([_anchor(s, lines, text.body_size) for s in sections])
    contents = [_Content() for _ in sections]
    for block in document.blocks:
        index = partition.of(_position(block.locator))
        if index is not None and block.kind != RUNNING_HEADER_KIND:
            contents[index].blocks.append(block)
    for line in lines:
        index = partition.of(_line_position(line))
        if index is not None:
            contents[index].lines.append(line)
    for table in tables:
        index = partition.of(_position(table.evidence.locator))
        if index is not None:
            contents[index].tables.append(table)
    return contents


def _course_starts(lines: list[pdf.Line]) -> list[int]:
    return [i for i in range(len(lines)) if pdf._title_at(lines, i)]


def _courses(
    lines: list[pdf.Line], url: str, sha256: str
) -> tuple[list[CourseRecord], list[UnparsedCourseBlock]]:
    """A listing's courses. Split within the section, so the last course
    doesn't run on into the next listing's heading and introduction."""
    starts = _course_starts(lines)
    ends = [*starts[1:], len(lines)]
    courses = [
        pdf._course(lines[s:e], url, sha256) for s, e in zip(starts, ends, strict=True)
    ]
    unparsed = [
        UnparsedCourseBlock(
            reason=f"title line not understood: {line.text!r}",
            evidence=pdf._evidence(url, sha256, [line], line.text),
        )
        for index, line in enumerate(lines)
        if line.bold
        and pdf.COURSE_TITLE_START.match(line.body_text)
        and not any(s <= index < s + pdf.MAX_TITLE_LINES for s in starts)
    ]
    return courses, unparsed


def _prints_program_code(blocks: Iterable[Block]) -> bool:
    return any(block.text.startswith(PROGRAM_CODE_FACT) for block in blocks)


def _has_records(content: _Content) -> bool:
    """Whether the section holds what needs a page identity to load."""
    return (
        bool(content.tables)
        or bool(_course_starts(content.lines))
        or _prints_program_code(content.blocks)
    )


def _merge_subheadings(
    sections: list[VolumeSection], contents: list[_Content], result: EditionExtraction
) -> None:
    """A bookmark no rule maps, holding no courses, tables or program code,
    under a mapped parent is a sub-heading of that page ("Academic Calendar -
    Fall 2026"); its content is read as the parent's."""
    index_by_titles = {tuple(s.titles): i for i, s in enumerate(sections)}
    for index, section in enumerate(sections):
        parent = index_by_titles.get(tuple(section.titles[:-1]))
        if (
            section.path is None
            and parent is not None
            and sections[parent].merged_into is None
            and sections[parent].path is not None
            and not _has_records(contents[index])
        ):
            section.merged_into = sections[parent].url
            contents[parent].extend(contents[index])
            result.issue(
                "volume_section_merged",
                "warning",
                section.merged_into,
                f"{' › '.join(section.titles)} (page {section.page}) read as part of this page",
            )


@dataclass(slots=True)
class _Tabs:
    """The tabs a section prints, and which tab (if any) each stretch of the
    section is in."""

    tabs: list[Tab] = field(default_factory=list)
    labels: set[str] = field(default_factory=set)
    starts: list[Position] = field(default_factory=list)
    ids: list[str | None] = field(default_factory=list)

    def switch(self, position: Position, tab: Tab | None) -> None:
        self.starts.append(position)
        self.ids.append(tab.id if tab else None)
        if tab is not None:
            self.tabs.append(tab)
            self.labels.add(normalized_title(tab.label))

    def at(self, position: Position) -> str | None:
        index = bisect_right(self.starts, position) - 1
        return self.ids[index] if index >= 0 else None


def _ends_tab(current: str | None, level: int, tab_level: int | None) -> bool:
    """Whether a heading that isn't a tab label ends the current tab: any
    heading at the tab level does, and any heading at all ends the overview,
    whose own tables sit right under its label."""
    if current is None:
        return False
    return level == tab_level or current in INTRODUCTORY_TABS


def _tab_level(blocks: list[Block], title: str) -> int | None:
    """Tabs are printed at the first heading level below the page title."""
    wanted = normalized_title(title)
    levels = [
        block.level
        for block in blocks
        if block.kind == "heading"
        and block.level is not None
        and normalized_title(block.text) != wanted
    ]
    return min(levels) if levels else None


def _section_blocks(
    blocks: list[Block], title: str, vocabulary: Mapping[str, str]
) -> tuple[list[Block], _Tabs]:
    """Blocks renumbered, each with its tab and the headings above it below
    the title and tab, as the site's blocks have."""
    result: list[Block] = []
    tabs = _Tabs()
    headings: list[tuple[int, str]] = []
    wanted = normalized_title(title)
    tab_level = _tab_level(blocks, title)
    current: str | None = None
    for block in blocks:
        level = block.level if block.kind == "heading" else None
        is_title = not result and normalized_title(block.text) == wanted
        tab_id = (
            vocabulary.get(normalized_title(block.text)) if level == tab_level else None
        )
        if tab_id is not None:
            current = tab_id
            tabs.switch(_position(block.locator), Tab(id=tab_id, label=block.text))
            headings = []
        elif (
            level is not None and not is_title and _ends_tab(current, level, tab_level)
        ):
            # Not every tab's label is printed, so the content after a
            # labelled tab may be another tab's ("Overview" followed by
            # requirement tables under "Summary of Requirements").
            current = None
            tabs.switch(_position(block.locator), None)
        if tab_id is None and level is not None and not is_title:
            headings = [(lvl, text) for lvl, text in headings if lvl < level]
        result.append(
            block.model_copy(
                update={
                    "index": len(result),
                    "section": [text for _, text in headings],
                    "locator": block.locator.model_copy(update={"tab": current}),
                }
            )
        )
        if level is not None and not is_title and tab_id is None:
            headings.append((level, block.text))
    return result, tabs


def _section_tables(
    tables: list[CourseListTable], title: str, tabs: _Tabs
) -> list[CourseListTable]:
    """Tables renumbered, in their tab, with heading paths below the title
    and tab."""
    wanted = normalized_title(title)
    result = []
    for index, table in enumerate(tables):
        section = list(table.section)
        titles = [normalized_title(text) for text in section]
        if wanted in titles:
            section = section[titles.index(wanted) + 1 :]
        if section and normalized_title(section[0]) in tabs.labels:
            section = section[1:]
        tab = tabs.at(_position(table.evidence.locator))
        result.append(
            table.model_copy(
                update={
                    "index": index,
                    "section": section,
                    "tab": tab,
                    "evidence": table.evidence.model_copy(
                        update={
                            "locator": table.evidence.locator.model_copy(
                                update={"tab": tab}
                            )
                        }
                    ),
                }
            )
        )
    return result


def _facts(
    lines: list[pdf.Line], blocks: list[Block], url: str, sha256: str
) -> list[LabeledFact]:
    """Overview facts: a block whose first line opens with a bold label."""
    starts = {_position(block.locator): block for block in blocks}
    facts = []
    for line in lines:
        block = starts.get(_line_position(line))
        label = line.bold_prefix()
        if block is None or not FACT_LABEL.match(label) or block.text == label:
            continue
        facts.append(
            LabeledFact(
                label=label.rstrip(":").strip(),
                value=block.text[len(label) :].strip(),
                evidence=Evidence(
                    url=url, sha256=sha256, locator=block.locator, text=block.text
                ),
            )
        )
    return facts


def _has_plan_grid(lines: list[pdf.Line]) -> bool:
    return any(pdf._starts_plan_grid(lines, i) for i in range(len(lines)))


# Pages


def _crumbs(
    sections: list[VolumeSection], index: int, root: VolumeSection | None
) -> list[Crumb]:
    """Home › level root › ancestors › page, as the site prints them."""
    section = sections[index]
    by_titles = {tuple(s.titles): s for s in sections[: index + 1]}
    crumbs = [HOME]
    in_root = root is not None and (section.path or "").startswith(root.path or "/")
    if root is not None and in_root and section.titles != root.titles:
        crumbs.append(Crumb(text=root.titles[-1], url=root.url))
    for depth in range(1, len(section.titles) + 1):
        ancestor = by_titles.get(tuple(section.titles[:depth]))
        is_page = depth == len(section.titles)
        linked = not is_page and ancestor is not None and ancestor.path is not None
        crumbs.append(
            Crumb(text=section.titles[depth - 1], url=ancestor.url if linked else None)
        )
    return crumbs


def _level_root(sections: list[VolumeSection]) -> VolumeSection | None:
    """The bookmark for the level's own page ("Undergraduate")."""
    return next(
        (s for s in sections if len(s.titles) == 1 and s.path in LEVEL_ROOTS), None
    )


@dataclass(slots=True)
class _Page:
    index: int
    document: PageDocument
    content: _Content
    tabs: _Tabs
    signals: PageSignals
    kind: PageKind


def _page(
    sections: list[VolumeSection],
    index: int,
    content: _Content,
    root: VolumeSection | None,
    vocabulary: Mapping[str, str],
    sha256: str,
    edition: str,
) -> _Page:
    section = sections[index]
    title = section.titles[-1]
    blocks, tabs = _section_blocks(content.blocks, title, vocabulary)
    document = PageDocument(
        url=section.url,
        sha256=sha256,
        title=title,
        heading=title,
        edition_label=edition,
        breadcrumbs=_crumbs(sections, index, root),
        tabs=tabs.tabs,
        blocks=blocks,
    )
    signals = PageSignals(
        path=edition_path(section.url),
        tab_ids=frozenset(),
        has_course_blocks=bool(_course_starts(content.lines)),
        has_course_lists=bool(content.tables),
        has_plan_grids=_has_plan_grid(content.lines),
        prints_program_code=_prints_program_code(document.blocks),
    )
    kind = classify_page(section.url, signals) if section.path else PageKind.INFORMATION
    return _Page(index, document, content, tabs, signals, kind)


def _mark_units(sections: list[VolumeSection], pages: list[_Page]) -> None:
    """A page whose bookmarks hold program pages is a school or college page:
    the volume prints its Programs tab as those children."""
    program_parents = {
        tuple(sections[page.index].titles[:-1])
        for page in pages
        if page.kind is PageKind.PROGRAM
    }
    for page in pages:
        if tuple(sections[page.index].titles) in program_parents and page.kind in {
            PageKind.PROGRAM,
            PageKind.INFORMATION,
        }:
            page.kind = PageKind.ACADEMIC_UNIT


def _program_page(page: _Page, url: str, sha256: str) -> ProgramPage:
    document = page.document
    parts = [part for part in edition_path(document.url).split("/") if part]
    return ProgramPage(
        url=document.url,
        sha256=document.sha256,
        name=document.heading,
        level="graduate" if "graduate" in parts else "undergraduate",
        units=[crumb.text for crumb in document.breadcrumbs[1:-1]],
        facts=_facts(page.content.lines, document.blocks, url, sha256),
        tables=_section_tables(page.content.tables, document.heading, page.tabs),
        plans=[],
    )


def _add_courses(result: EditionExtraction, page: _Page, url: str, sha256: str) -> None:
    """A listing's courses. A level listing's are recorded as printed on it,
    which is how the interpreter learns their level."""
    courses, unparsed = _courses(page.content.lines, url, sha256)
    page_url = page.document.url
    for block in unparsed:
        result.issue("course_block_unparsed", "error", page_url, block.reason)
    is_level_listing = edition_path(page_url).startswith(LEVEL_LISTINGS)
    for course in courses:
        if course.code in result.courses:
            result.issue("duplicate_course", "warning", page_url, course.code)
        listing = Evidence(
            url=page_url,
            sha256=sha256,
            locator=course.evidence.locator,
            text=course.evidence.text,
        )
        result.courses[course.code] = CourseEntry(
            course=course,
            also_listed_on=[listing] if is_level_listing else [],
            discrepancies=[],
        )


def _report_unmapped(result: EditionExtraction, page: _Page) -> None:
    detail = f"{page.document.heading}: no page URL; add an override"
    # Programs and courses need a page identity before they can load.
    severity = "error" if _has_records(page.content) else "warning"
    result.issue("volume_section_unmapped", severity, page.document.url, detail)


def assemble_volume(
    sections: list[VolumeSection],
    text: pdf.PdfText,
    document: PageDocument,
    tables: list[CourseListTable],
    url: str,
    sha256: str,
    edition: str,
    vocabulary: Mapping[str, str] | None = None,
) -> EditionExtraction:
    """The volume's sections as an edition's pages, courses and programs.

    `document` and `tables` are the whole volume's (`pdf_document`,
    `pdf_requirement_tables`); each block, line and table goes to the section
    whose title precedes it. `vocabulary` (from `tab_vocabulary`) turns
    printed tab labels back into the site's tabs."""
    result = EditionExtraction(edition)
    contents = _contents(sections, text, document, tables)
    _merge_subheadings(sections, contents, result)
    root = _level_root(sections)
    pages = [
        _page(sections, index, contents[index], root, vocabulary or {}, sha256, edition)
        for index, section in enumerate(sections)
        if section.merged_into is None
    ]
    _mark_units(sections, pages)
    for page in pages:
        if sections[page.index].path is None:
            _report_unmapped(result, page)
        elif page.kind is PageKind.PROGRAM:
            result.programs.append(_program_page(page, url, sha256))
            if page.signals.has_plan_grids:
                result.issue(
                    "volume_plan_grid_not_extracted",
                    "warning",
                    page.document.url,
                    "suggested plans are printed but not parsed from PDF volumes",
                )
        elif page.kind is PageKind.COURSE_LISTING:
            _add_courses(result, page, url, sha256)
        result.pages.append(ExtractedPage(kind=page.kind, document=page.document))
    return result


def extract_volume(
    body: bytes,
    url: str,
    sha256: str,
    edition: str,
    references: References,
    vocabulary: Mapping[str, str] | None = None,
    overrides: Mapping[str, str] | None = None,
) -> EditionExtraction:
    """A full volume as an edition's extraction. `references` and
    `vocabulary` come from `reference_paths` and `tab_vocabulary` over other
    editions' pages, nearest edition first."""
    outline = read_outline(body)
    if not outline:
        result = EditionExtraction(edition)
        result.issue("volume_without_outline", "error", url, "no bookmarks to split by")
        return result
    return assemble_volume(
        split_volume(outline, url, edition, references, overrides),
        pdf.read_pdf(body),
        pdf.pdf_document(body, url, sha256),
        pdf.pdf_requirement_tables(body, url, sha256),
        url,
        sha256,
        edition,
        vocabulary,
    )


def basis_counts(sections: list[VolumeSection]) -> Counter[str]:
    """How each section's URL was found ("merged" for sub-headings)."""
    return Counter("merged" if s.merged_into else s.basis for s in sections)
