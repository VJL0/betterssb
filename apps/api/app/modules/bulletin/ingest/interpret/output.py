"""What the `interpret` stage writes and the `import` stage loads.

One directory per edition (`interpreted/<edition>/`), one JSONL file per record
type, plus `summary.json` with the counts and the fingerprint of everything
that produced them. Records are plain data with their sources; loading them
needs nothing from the extractors.
"""

from __future__ import annotations

from typing import Any

from pydantic import Field

from app.modules.bulletin.ingest.extract.courses import CreditHours
from app.modules.bulletin.ingest.records import Record
from app.modules.bulletin.rules import RequirementTree, Requisite, SourceRef

INTERPRETER_VERSION = "1"

COURSES_FILE = "courses.jsonl"
PROGRAMS_FILE = "programs.jsonl"
UNITS_FILE = "units.jsonl"
POLICIES_FILE = "policies.jsonl"
DESIGNATIONS_FILE = "designations.jsonl"
ISSUES_FILE = "issues.jsonl"
SUMMARY_FILE = "summary.json"
RECORD_FILES = (
    COURSES_FILE,
    PROGRAMS_FILE,
    UNITS_FILE,
    POLICIES_FILE,
    DESIGNATIONS_FILE,
    ISSUES_FILE,
)


class CoursePartOut(Record):
    label: str
    text: str
    source: SourceRef


class CourseOut(Record):
    subject: str
    number: str
    title: str
    description: str
    credits: CreditHours
    levels: list[str]
    parts: list[CoursePartOut]
    attributes: list[str]
    requisites: list[Requisite]
    # Codes named anywhere else in the entry (description, restrictions).
    mentioned: list[str]
    source: SourceRef

    @property
    def code(self) -> str:
        return f"{self.subject} {self.number}"


class PlanOut(Record):
    position: int
    label: str
    total_hours: str
    terms: list[dict[str, Any]]
    footnotes: list[dict[str, Any]]
    source: SourceRef


class ProgramOut(Record):
    # Edition-independent path, the program's identity across editions.
    path: str
    url: str
    sha256: str
    # The snapshot's URL when it isn't `url` (a PDF volume).
    source_url: str | None = None

    @property
    def snapshot_url(self) -> str:
        return self.source_url or self.url

    name: str
    level: str
    credential: str
    award: str
    program_code: str | None
    unit_slug: str | None
    campuses: list[str]
    facts: dict[str, Any]
    requirements: RequirementTree
    plans: list[PlanOut]


class UnitOut(Record):
    slug: str
    name: str
    parent_slug: str | None
    kind: str
    level: str
    url: str
    sha256: str | None
    source_url: str | None = None

    @property
    def snapshot_url(self) -> str:
        return self.source_url or self.url


class PolicyOut(Record):
    url: str
    sha256: str
    source_url: str | None = None

    @property
    def snapshot_url(self) -> str:
        return self.source_url or self.url

    position: int
    page_kind: str
    page_title: str
    headings: list[str]
    tab: str | None
    topic: str
    body: str
    sources: list[SourceRef]


class DesignationOut(Record):
    designation: str
    role: str
    item: int
    course: str
    source: SourceRef


class IssueOut(Record):
    stage: str
    code: str
    severity: str
    url: str = ""
    detail: str = ""


class InterpretedSummary(Record):
    edition: str
    extractor_version: str
    interpreter_version: str = INTERPRETER_VERSION
    rules_version: str
    # SHA-256 over the record files and the versions above.
    fingerprint: str
    counts: dict[str, int] = Field(default_factory=dict)
