"""The Bulletin API's responses. Requirement trees and requisite expressions are
served in the rule language's own shape (`app.modules.bulletin.rules`)."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any

from pydantic import Field

from app.modules.bulletin.rules import RequirementTree, RequisiteExpression, SourceRef
from app.shared.schemas import BaseSchema


class EditionSummary(BaseSchema):
    code: str
    source_url: str
    published_at: datetime
    courses: int
    programs: int


class CourseSummary(BaseSchema):
    code: str
    subject: str
    number: str
    title: str
    credits: str
    credits_min: Decimal
    credits_max: Decimal
    levels: list[str]
    attributes: list[str]


class CoursePart(BaseSchema):
    label: str
    text: str


class CourseRequisite(BaseSchema):
    kind: str
    text: str
    expression: RequisiteExpression | None
    interpretation: str
    notes: list[str]


class ProgramReference(BaseSchema):
    id: int
    name: str
    level: str
    credential: str
    award: str


class CourseDetail(CourseSummary):
    edition: str
    description: str
    credit_options: list[Decimal]
    parts: list[CoursePart]
    requisites: list[CourseRequisite]
    # Courses this edition lists that name this one as a pre- or corequisite.
    required_by: list[str]
    # Programs whose requirements name this course.
    programs: list[ProgramReference]
    source: SourceRef


class CourseEdition(BaseSchema):
    edition: str
    title: str
    credits: str
    description: str


class ProgramSummary(ProgramReference):
    program_code: str | None
    unit: str | None
    campuses: list[str]


class AcademicPlan(BaseSchema):
    label: str
    total_hours: str
    terms: list[dict[str, Any]]
    footnotes: list[dict[str, Any]]


class ProgramDetail(ProgramSummary):
    edition: str
    url: str
    facts: dict[str, Any]
    requirements: RequirementTree
    # Suggested sequences; advice, not requirements.
    plans: list[AcademicPlan]


class ProgramEdition(BaseSchema):
    edition: str
    name: str
    url: str


class PolicySection(BaseSchema):
    url: str
    page_title: str
    headings: list[str]
    topic: str
    body: str
    sources: list[SourceRef] = Field(default_factory=list)


class AcademicUnit(BaseSchema):
    slug: str
    name: str
    parent_slug: str | None
    kind: str
    level: str
    url: str
