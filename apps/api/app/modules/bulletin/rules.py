"""BetterSSB's academic requirement language, shared by the offline interpreter
(which writes it) and the API (which serves and evaluates it).

A requirement is a tree. Inner nodes combine children (`all`, `any`,
`choose`); leaves name what a student must have (`course`, `course_filter`,
`milestone`) or keep the published wording when it can't yet be expressed
(`text`). Every node keeps the passage it came from and says how far it was
interpreted, so a reader can always tell a structured rule from prose that
still needs a person.

Prerequisites and corequisites use a smaller expression language
(`RequisiteExpression`) with the same shape: `all` / `any` over courses, test
scores and conditions Banner prints but the Bulletin doesn't define.

This module is pure data: no database, network or ingestion imports, so the
production API can depend on it.
"""

from __future__ import annotations

import re
from decimal import Decimal
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

RULES_VERSION = "1"

COURSE_CODE = re.compile(r"[A-Z]{2,5} [0-9A-Z]{4,5}")
SUBJECT = re.compile(r"[A-Z]{2,5}")
COURSE_NUMBER = re.compile(r"[0-9A-Z]{4,5}")


def expand_course_code(text: str) -> list[str]:
    """The course codes a printed code stands for, or empty if it isn't one.

    CourseLeaf names cross-listed courses in one link: "GUS/ENST 3061" (two
    subjects, one number), "ECON 3507/3597" (one subject, two numbers),
    "BA 9212/FIN 9004" (two codes).
    """
    codes: list[str] = []
    pending_subjects: list[str] = []
    for part in (piece.strip() for piece in text.strip().split("/")):
        if COURSE_CODE.fullmatch(part):
            subject, number = part.split(" ")
            codes += [f"{s} {number}" for s in [*pending_subjects, subject]]
            pending_subjects = []
        elif SUBJECT.fullmatch(part):
            pending_subjects.append(part)
        elif COURSE_NUMBER.fullmatch(part) and codes and not pending_subjects:
            codes.append(f"{codes[-1].split(' ')[0]} {part}")
        else:
            return []
    return [] if pending_subjects else list(dict.fromkeys(codes))


class RuleModel(BaseModel):
    # Stored and written snake_case (`model_dump_json()`); the API serializes
    # by alias, so responses are camelCase like the rest of BetterSSB's API.
    model_config = ConfigDict(
        extra="forbid",
        alias_generator=to_camel,
        validate_by_name=True,
        validate_by_alias=True,
    )


class Interpretation(StrEnum):
    """How much of a passage the structured form captures."""

    # Every condition in the passage is in the structure.
    INTERPRETED = "interpreted"
    # The structure captures some conditions; `notes` say what's missing.
    PARTIAL = "partial"
    # Kept as published text only.
    UNINTERPRETED = "uninterpreted"


class Validation(StrEnum):
    """What has checked the structured form against its source."""

    UNVERIFIED = "unverified"
    # Deterministic checks passed (references resolve, totals add up).
    STRUCTURALLY_CHECKED = "structurally_checked"
    # A person or independent review compared it to the passage.
    REVIEWED = "reviewed"
    # A check found a problem; `notes` say which.
    FAILED = "failed"


class Outcome(StrEnum):
    """An evaluator's answer for one node. "Not enough information" is never
    "not satisfied", and nothing unsupported is reported as satisfied."""

    SATISFIED = "satisfied"
    NOT_SATISFIED = "not_satisfied"
    UNKNOWN = "unknown"
    NOT_APPLICABLE = "not_applicable"
    REQUIRES_REVIEW = "requires_review"
    UNSUPPORTED = "unsupported"


class SourceRef(RuleModel):
    """A passage in a stored snapshot (see the ingester's `Evidence`)."""

    url: str
    sha256: str
    xpath: str | None = None
    line: int | None = None
    tab: str | None = None
    page: int | None = None
    text: str


class CourseFilter(RuleModel):
    """Courses picked by subject, number range, attribute or level rather than
    by name ("any MATH course numbered 1038 to 4999", "2000+ ARTH elective")."""

    subjects: list[str] = Field(default_factory=list)
    number_min: str | None = None
    number_max: str | None = None
    attributes: list[str] = Field(default_factory=list)
    # "undergraduate" / "graduate" when the passage limits the level.
    level: str | None = None
    exclude_courses: list[str] = Field(default_factory=list)


MilestoneKind = Literal[
    "thesis",
    "dissertation",
    "examination",
    "candidacy",
    "clinical",
    "practicum",
    "internship",
    "residency",
    "recital",
    "portfolio",
    "project",
    "other",
]

NodeKind = Literal[
    "all", "any", "choose", "course", "course_filter", "milestone", "text"
]


class RequirementNode(RuleModel):
    """One node of a program's requirement tree."""

    # Stable within the program version: the table and row path it came from
    # ("t0", "t0.r12", "t0.r12.r13").
    id: str
    kind: NodeKind
    label: str = ""
    children: list[RequirementNode] = Field(default_factory=list)

    # Leaves.
    course: str | None = None
    course_filter: CourseFilter | None = None
    milestone: MilestoneKind | None = None

    # Constraints on the node (any kind). `choose` needs a count or credit bound.
    min_courses: int | None = None
    max_courses: int | None = None
    min_credits: Decimal | None = None
    max_credits: Decimal | None = None
    min_grade: str | None = None
    # Hours as printed beside the row or group ("3", "3-4", "12").
    hours_text: str = ""

    # Footnotes attached to the row, with their text, verbatim.
    footnotes: list[str] = Field(default_factory=list)
    # The node's published wording and where it sits.
    source_text: str = ""
    sources: list[SourceRef] = Field(default_factory=list)

    interpretation: Interpretation = Interpretation.INTERPRETED
    validation: Validation = Validation.UNVERIFIED
    # What wasn't captured, or why a reader should check.
    notes: list[str] = Field(default_factory=list)


class RequirementTree(RuleModel):
    """A program version's requirements: one root per requirement table, in page
    order, under the headings and tab the table sits in."""

    rules_version: str = RULES_VERSION
    program_url: str
    roots: list[RequirementNode]
    # Requirement prose outside any table (residency, GPA, exams), kept verbatim.
    prose: list[RequirementNode] = Field(default_factory=list)


RequisiteKind = Literal[
    "all", "any", "choose", "course", "course_filter", "test", "condition", "text"
]


class RequisiteExpression(RuleModel):
    """A course's prerequisite or corequisite condition."""

    kind: RequisiteKind
    children: list[RequisiteExpression] = Field(default_factory=list)
    course: str | None = None
    course_filter: CourseFilter | None = None
    # "Minimum grade of C- in …" applies to the courses beneath it.
    min_grade: str | None = None
    # "(may be taken concurrently)"
    concurrent: bool = False
    # Placement and test codes Banner checks ("'Y' in MC6", "MA04 score 50").
    test: str | None = None
    score: str | None = None
    # `choose` ("Complete 3 of the following"), and counted course sets
    # ("2 3000-level ADV courses", "9 credits in ART courses numbered 3600…").
    min_count: int | None = None
    min_credits: Decimal | None = None
    # "minimum GPA of 3 in: …" over the courses beneath it.
    min_gpa: Decimal | None = None
    # A condition named in words (class standing, program admission…).
    text: str = ""


class Requisite(RuleModel):
    kind: Literal["prerequisite", "corequisite"]
    source_text: str
    expression: RequisiteExpression | None
    interpretation: Interpretation
    notes: list[str] = Field(default_factory=list)
    # Every course code the passage names, whether or not it parsed.
    courses: list[str] = Field(default_factory=list)


RequirementNode.model_rebuild()
RequisiteExpression.model_rebuild()
