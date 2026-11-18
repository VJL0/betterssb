from __future__ import annotations

from typing import Literal

from pydantic import Field

from app.shared.schemas import BaseSchema

AuditStatus = Literal["complete", "incomplete", "in_progress", "none"]


class Progress(BaseSchema):
    credits: float | None = None
    courses: int | None = None
    sets: int | None = None
    """Course sets, like a two-course lab sequence."""
    subrequirements: int | None = None
    gpa: float | None = None


class AuditCourse(BaseSchema):
    term: str
    banner_term: str = ""
    """The Temple Banner term code for `term` ("FL24" → "202436"), when DARS gives one."""
    course: str
    title: str = ""
    credits: float | None = None
    grade: str = ""
    in_progress: bool = False
    condition_code: str = ""
    """DARS's condition code column, which marks repeats and other special cases."""
    notes: list[str] = Field(default_factory=list)
    """Description lines after the title, such as a transfer source ("T01008: AP314")."""
    transfer: bool = False
    """Credit from another institution or exam (AP, IB)."""
    transfer_institution: str = ""
    """The source of transfer credit: the institution ("T01008") and its course ("AP314")."""
    transfer_course: str = ""
    satisfies: str = ""
    """The course it counts as ("Satisfies: AMST 0855"), usually a cross-listing."""
    exception: bool = False
    """An advisor waiver or substitution recorded against the requirement ("CISS.TBS-14"), not a class."""


class ChoiceCourse(BaseSchema):
    course: str
    """A course ("CIS 3381") or a range ("CST 2000-4999")."""
    taken: str = ""
    """When it has to be taken to count: "SP19 OR AFTER", "SP10-S216"."""
    max_credits: float | None = None
    """The most credits it can count for ("3381(4)")."""


class CourseChoice(BaseSchema):
    """One option under SELECT FROM: a course, or cross-listed equivalents DARS joins with OR."""

    courses: list[ChoiceCourse]


class SubRequirement(BaseSchema):
    number: str = ""
    code: str = ""
    """DARS's code for it ("CISS.TBS-13"); exceptions use it as their course."""
    aliases: list[str] = Field(default_factory=list)
    """Other codes it answers to, such as a minor's shared GenEd rule ("MINORGENED")."""
    title: str = ""
    notes: list[str] = Field(default_factory=list)
    status: AuditStatus
    required: bool = False
    """DARS's "R" marker: it has to be met even when its requirement's count is."""
    required_credits: float | None = None
    required_count: int | None = None
    """Courses or sets to complete, in the unit its progress counts."""
    required_gpa: float | None = None
    max_credits: float | None = None
    earned: Progress | None = None
    in_progress: Progress | None = None
    needs: Progress | None = None
    courses: list[AuditCourse] = Field(default_factory=list)
    select_from: list[str] = Field(default_factory=list)
    """Every course and range under SELECT FROM, in display order."""
    choices: list[CourseChoice] = Field(default_factory=list)
    """The same options grouped into choices, with their limits."""
    not_from: list[str] = Field(default_factory=list)
    """Courses that can't count toward it."""


class Requirement(BaseSchema):
    code: str
    category: str = ""
    title: str = ""
    status: AuditStatus
    notes: list[str] = Field(default_factory=list)
    required_credits: float | None = None
    required_gpa: float | None = None
    required_subrequirements: int | None = None
    required_count: int | None = None
    max_credits: float | None = None
    earned: Progress | None = None
    in_progress: Progress | None = None
    needs: Progress | None = None
    subrequirements: list[SubRequirement] = Field(default_factory=list)


class HoursSummary(BaseSchema):
    """Credit hours from the audit's progress chart, for the degree or one category."""

    category: str = ""
    """"GENED", "MAJOR", "MINOR", "ELECTIVES"; empty for the whole degree."""
    completed_credits: float = 0.0
    in_progress_credits: float = 0.0
    unfulfilled_credits: float = 0.0
    planned_credits: float = 0.0
    gpa: float | None = None
    required_gpa: float | None = None


class Audit(BaseSchema):
    student_name: str = ""
    program_title: str = ""
    program_code: str = ""
    catalog_year: str = ""
    prepared_on: str = ""
    graduation_date: str = ""
    complete: bool | None = None
    analysis_complete: bool = False
    """The page ends with DARS's "END OF ANALYSIS" line, so nothing was cut off."""
    degree_totals: HoursSummary | None = None
    category_totals: list[HoursSummary] = Field(default_factory=list)
    requirements: list[Requirement] = Field(default_factory=list)
