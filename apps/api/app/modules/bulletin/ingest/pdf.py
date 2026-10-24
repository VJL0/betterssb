"""Courses and policies from a full-volume Bulletin PDF.

For editions with no HTML we can fetch (2025-2026 is PDF-only, and robots.txt
disallows the HTML archives), the volume PDF the student downloads from the
archives page is the source. Its outline gives each section's pages; course
entries are a bold "CIS 3296. Software Design. 4 Credit Hours." heading, a
description, then bold-labeled parts, the same fields as the HTML.

Programs aren't read from PDFs: their tables are positioned text, and guessing
rows and alternatives from coordinates would produce requirement trees that look
authoritative and aren't.
"""

from __future__ import annotations

import re
from collections.abc import Iterator
from dataclasses import dataclass, field

import pymupdf

from app.modules.bulletin.ingest.courses import (
    COURSE_TITLE,
    SUBJECT_HEADING,
    CourseDraft,
    build_course,
)
from app.modules.bulletin.ingest.rules import SUBJECT, clean_text

COURSE_SECTION_PREFIX = "course descriptions"
POLICY_SECTION_PREFIX = "academic policies"
COURSE_HEADING_START = re.compile(rf"^{SUBJECT} (?:[0-9]{{4}}|[A-Z][0-9]{{3}})\.\s")
# Running headers and page numbers sit in these margins (points).
HEADER_MARGIN = 50
FOOTER_MARGIN = 25
BOLD_FLAG = 16
MAX_HEADING_LINES = 4
# Course headings are body-size; anything this much larger is a section heading.
HEADING_SIZE_STEP = 1.5


@dataclass(slots=True)
class OutlineEntry:
    level: int
    title: str
    first_page: int  # zero-based
    last_page: int  # zero-based, inclusive


@dataclass(slots=True)
class PolicyText:
    title: str
    body_text: str
    first_page: int


@dataclass(slots=True)
class PdfVolume:
    subjects: dict[str, str]
    courses: list[CourseDraft]
    policies: list[PolicyText]
    unparsed_headings: list[str] = field(default_factory=list)


@dataclass(slots=True)
class _Line:
    text: str
    first_span: str
    first_bold: bool
    all_bold: bool
    size: float


def outline(document: pymupdf.Document) -> list[OutlineEntry]:
    toc = document.get_toc()
    entries: list[OutlineEntry] = []
    for index, (level, title, page) in enumerate(toc):
        following = next(
            (
                next_page
                for next_level, _, next_page in toc[index + 1 :]
                if next_level <= level
            ),
            document.page_count,
        )
        entries.append(
            OutlineEntry(
                level, clean_text(title), page - 1, max(page - 1, following - 1)
            )
        )
    return entries


def _children(entries: list[OutlineEntry], prefix: str) -> list[OutlineEntry]:
    for index, entry in enumerate(entries):
        if entry.level == 1 and entry.title.lower().startswith(prefix):
            children = []
            for child in entries[index + 1 :]:
                if child.level <= entry.level:
                    break
                if child.level == entry.level + 1:
                    children.append(child)
            return children
    return []


def _page_lines(page: pymupdf.Page) -> Iterator[_Line]:
    bottom = page.rect.height - FOOTER_MARGIN
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            spans = [span for span in line["spans"] if span["text"].strip()]
            if not spans or line["bbox"][1] < HEADER_MARGIN or line["bbox"][3] > bottom:
                continue
            bold = [
                bool(span["flags"] & BOLD_FLAG) or "Bold" in span["font"]
                for span in spans
            ]
            yield _Line(
                text=clean_text("".join(span["text"] for span in spans)),
                first_span=clean_text(spans[0]["text"]),
                first_bold=bold[0],
                all_bold=all(bold),
                size=max(span["size"] for span in spans),
            )


class _CourseReader:
    """Reads course entries from a stream of lines."""

    def __init__(self) -> None:
        self.courses: list[CourseDraft] = []
        self.unparsed: list[str] = []
        self.heading = ""
        self.heading_lines = 0
        self.description: list[str] = []
        self.parts: list[tuple[str, list[str]]] = []
        self.body_size = 0.0

    def finish(self) -> None:
        if not self.heading:
            return
        parts = {label: clean_text(" ".join(lines)) for label, lines in self.parts}
        course = build_course(
            self.heading, clean_text(" ".join(self.description)), parts
        )
        if course:
            self.courses.append(course)
        else:
            self.unparsed.append(self.heading)
        self.heading = ""
        self.description = []
        self.parts = []

    def heading_open(self) -> bool:
        return bool(self.heading) and not COURSE_TITLE.match(self.heading)

    def read(self, line: _Line) -> None:
        if line.all_bold and COURSE_HEADING_START.match(line.text):
            self.finish()
            self.heading, self.heading_lines = line.text, 1
            self.body_size = line.size
        elif not self.heading:
            return
        elif line.all_bold and line.size > self.body_size + HEADING_SIZE_STEP:
            # The next subject's heading: the last course ends here.
            self.finish()
        elif (
            self.heading_open()
            and line.all_bold
            and self.heading_lines < MAX_HEADING_LINES
        ):
            self.heading = f"{self.heading} {line.text}"
            self.heading_lines += 1
        elif line.first_bold and line.first_span.endswith(":") and not line.all_bold:
            label = line.first_span.rstrip(":")
            self.parts.append((label, [line.text[len(line.first_span) :]]))
        elif line.first_bold and line.all_bold and line.text.endswith(":"):
            self.parts.append((line.text.rstrip(":"), []))
        elif self.parts:
            self.parts[-1][1].append(line.text)
        else:
            self.description.append(line.text)


def read_volume(path: str) -> PdfVolume:
    with pymupdf.open(path) as document:
        entries = outline(document)
        subject_entries = _children(entries, COURSE_SECTION_PREFIX)
        subjects = {
            match["code"]: match["name"]
            for entry in subject_entries
            if (match := SUBJECT_HEADING.match(entry.title))
        }
        reader = _CourseReader()
        if subject_entries:
            first = subject_entries[0].first_page
            last = max(entry.last_page for entry in subject_entries)
            for number in range(first, last + 1):
                for line in _page_lines(document[number]):
                    reader.read(line)
        reader.finish()
        policy_entries = _children(entries, POLICY_SECTION_PREFIX)
        next_titles = [entry.title for entry in policy_entries[1:]] + [""]
        policies = [
            PolicyText(
                entry.title,
                _section_text(document, entry, next_title),
                entry.first_page,
            )
            for entry, next_title in zip(policy_entries, next_titles, strict=True)
        ]
    return PdfVolume(subjects, reader.courses, policies, reader.unparsed)


def _section_text(
    document: pymupdf.Document, entry: OutlineEntry, next_title: str
) -> str:
    """An outline entry's text, from its title to the next entry's title.

    Sections share pages, so the shared first and last pages are cut at the titles.
    """
    text = " ".join(
        " ".join(line.text for line in _page_lines(document[number]))
        for number in range(entry.first_page, entry.last_page + 1)
    )
    start = max(text.find(entry.title), 0)
    end = text.find(next_title, start + len(entry.title)) if next_title else -1
    return (text[start:end] if end >= 0 else text[start:]).strip()
