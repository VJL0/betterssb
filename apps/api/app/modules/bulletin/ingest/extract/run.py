"""Extract one edition's HTML snapshots into typed JSONL, deterministically.

Output, under `extracted/<edition>/`:

- `pages.jsonl`: every page's `PageDocument`, with its kind
- `courses.jsonl`: one entry per course, from the all-levels listing
  (`/courses/<subject>/`), with the undergraduate or graduate listing that
  also prints it and any disagreement between them
- `programs.jsonl`: every program page's structure
- `program_index.json`: the Academic Programs Chart
- `issues.jsonl`: anything that couldn't be extracted, with its location

Pages are processed in URL order and records are written sorted, so the same
snapshots always give byte-identical output.
"""

from __future__ import annotations

import json
import logging
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

from pydantic import BaseModel

from app.modules.bulletin.ingest.crawl_state import CrawlState
from app.modules.bulletin.ingest.extract.classify import (
    PageKind,
    classify_page,
    edition_path,
    page_signals,
)
from app.modules.bulletin.ingest.extract.courses import (
    CourseRecord,
    parse_course_listing,
)
from app.modules.bulletin.ingest.extract.document import page_document, parse_html
from app.modules.bulletin.ingest.extract.program_index import parse_program_index
from app.modules.bulletin.ingest.extract.programs import parse_program_page
from app.modules.bulletin.ingest.records import Evidence, PageDocument, Record
from app.modules.bulletin.ingest.store import ObjectStore

logger = logging.getLogger(__name__)

EXTRACTOR_VERSION = "2"
COURSE_FIELDS_COMPARED = ("title", "credits", "description", "attributes")


class ExtractedPage(Record):
    kind: PageKind
    document: PageDocument


class CourseEntry(Record):
    course: CourseRecord
    # Level listings (/undergraduate/courses/x/, /graduate/courses/x/) printing it.
    also_listed_on: list[Evidence]
    discrepancies: list[str]


class ExtractionIssue(Record):
    code: str
    severity: str
    url: str
    detail: str


@dataclass(slots=True)
class EditionExtraction:
    edition: str
    pages: list[ExtractedPage] = field(default_factory=list)
    courses: dict[str, CourseEntry] = field(default_factory=dict)
    level_courses: list[CourseRecord] = field(default_factory=list)
    programs: list[BaseModel] = field(default_factory=list)
    program_index: BaseModel | None = None
    issues: list[ExtractionIssue] = field(default_factory=list)

    def issue(self, code: str, severity: str, url: str, detail: str) -> None:
        self.issues.append(
            ExtractionIssue(code=code, severity=severity, url=url, detail=detail)
        )


def _is_level_listing(url: str) -> bool:
    path = edition_path(url)
    return path.startswith(("/undergraduate/courses/", "/graduate/courses/"))


def extract_edition(
    state: CrawlState, store: ObjectStore, edition: str
) -> EditionExtraction:
    result = EditionExtraction(edition)
    rows = [
        row
        for row in state.fetched(edition)
        if (row["content_type"] or "").startswith("text/html")
        and not row["duplicate_of"]
    ]
    for row in rows:
        url, sha256 = row["url"], row["sha256"]
        body = store.get(sha256)
        document = parse_html(body)
        kind = classify_page(url, page_signals(document, url))
        page = page_document(body, url, sha256)
        result.pages.append(ExtractedPage(kind=kind, document=page))
        if (
            page.edition_label
            and page.edition_label != edition
            and kind != PageKind.LEGACY
        ):
            result.issue(
                "edition_label_mismatch",
                "error",
                url,
                f"page says {page.edition_label}, crawled as {edition}",
            )
        detail = ""
        if kind is PageKind.COURSE_LISTING:
            courses, unparsed = parse_course_listing(document, url, sha256)
            for block in unparsed:
                result.issue("course_block_unparsed", "error", url, block.reason)
            if _is_level_listing(url):
                result.level_courses.extend(courses)
            else:
                for course in courses:
                    if course.code in result.courses:
                        result.issue("duplicate_course", "warning", url, course.code)
                    result.courses[course.code] = CourseEntry(
                        course=course, also_listed_on=[], discrepancies=[]
                    )
            detail = f"{len(courses)} courses"
        elif kind is PageKind.PROGRAM:
            program = parse_program_page(document, page)
            result.programs.append(program)
            detail = f"{len(program.tables)} tables, {len(program.plans)} plans"
        elif kind is PageKind.PROGRAM_INDEX:
            result.program_index = parse_program_index(document, url, sha256)
            detail = f"{len(result.program_index.listings)} listings"
        state.set_extraction(url, kind, "extracted", detail)
    _reconcile_level_listings(result)
    state.commit()
    return result


def _reconcile_level_listings(result: EditionExtraction) -> None:
    """Every course on a level listing should be on the all-levels listing,
    saying the same thing."""
    for course in result.level_courses:
        entry = result.courses.get(course.code)
        if entry is None:
            result.issue(
                "course_only_on_level_listing",
                "warning",
                course.evidence.url,
                course.code,
            )
            result.courses[course.code] = CourseEntry(
                course=course, also_listed_on=[], discrepancies=[]
            )
            continue
        entry.also_listed_on.append(course.evidence)
        for name in COURSE_FIELDS_COMPARED:
            if getattr(entry.course, name) != getattr(course, name):
                entry.discrepancies.append(f"{name} differs on {course.evidence.url}")
                result.issue(
                    "course_listing_discrepancy",
                    "warning",
                    course.evidence.url,
                    f"{course.code}: {name}",
                )


def _write_jsonl(path: Path, records: list[BaseModel]) -> None:
    with path.open("w") as handle:
        for record in records:
            handle.write(record.model_dump_json() + "\n")


def write_extraction(result: EditionExtraction, directory: Path) -> dict[str, int]:
    directory.mkdir(parents=True, exist_ok=True)
    pages = sorted(result.pages, key=lambda page: page.document.url)
    courses = [result.courses[code] for code in sorted(result.courses)]
    programs = sorted(result.programs, key=lambda program: program.url)
    issues = sorted(
        result.issues, key=lambda issue: (issue.code, issue.url, issue.detail)
    )
    _write_jsonl(directory / "pages.jsonl", pages)
    _write_jsonl(directory / "courses.jsonl", courses)
    _write_jsonl(directory / "programs.jsonl", programs)
    _write_jsonl(directory / "issues.jsonl", issues)
    if result.program_index is not None:
        (directory / "program_index.json").write_text(
            result.program_index.model_dump_json()
        )
    counts = {
        "pages": len(pages),
        "courses": len(courses),
        "programs": len(programs),
        "issues": len(issues),
        **{f"pages.{kind}": n for kind, n in Counter(p.kind for p in pages).items()},
    }
    (directory / "summary.json").write_text(
        json.dumps(
            {
                "edition": result.edition,
                "extractor_version": EXTRACTOR_VERSION,
                "counts": counts,
            },
            indent=2,
            sort_keys=True,
        )
    )
    return counts
