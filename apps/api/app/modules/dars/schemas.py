from __future__ import annotations

from typing import Literal

from pydantic import Field

from app.shared.schemas import BaseSchema

AuditStatus = Literal["complete", "incomplete", "in_progress", "none"]


class Progress(BaseSchema):
    credits: float | None = None
    courses: int | None = None
    # Course sets, like a two-course lab sequence.
    sets: int | None = None
    subrequirements: int | None = None
    gpa: float | None = None


class AuditCourse(BaseSchema):
    term: str
    # The Temple Banner term code for `term` ("FL24" → "202436"), when DARS gives one.
    banner_term: str = ""
    course: str
    title: str = ""
    credits: float | None = None
    grade: str = ""
    in_progress: bool = False
    # DARS's condition code column, which marks repeats and other special cases.
    condition_code: str = ""
    # Description lines after the title, such as a transfer source ("T01008: AP314").
    notes: list[str] = Field(default_factory=list)
    # Credit from another institution or exam (AP, IB).
    transfer: bool = False
    # The source of transfer credit: the institution ("T01008") and its course ("AP314").
    transfer_institution: str = ""
    transfer_course: str = ""
    # The course it counts as ("Satisfies: AMST 0855"), usually a cross-listing.
    satisfies: str = ""
    # An advisor waiver or substitution recorded against the requirement
    # ("CISS.TBS-14"), not a class.
    exception: bool = False


class ChoiceCourse(BaseSchema):
    # A course ("CIS 3381") or a range ("CST 2000-4999").
    course: str
    # When it has to be taken to count: "SP19 OR AFTER", "SP10-S216".
    taken: str = ""
    # The most credits it can count for ("3381(4)").
    max_credits: float | None = None


class CourseChoice(BaseSchema):
    """One option under SELECT FROM: a course, or cross-listed equivalents DARS joins with OR."""

    courses: list[ChoiceCourse]


class SubRequirement(BaseSchema):
    number: str = ""
    # DARS's code for it ("CISS.TBS-13"); exceptions use it as their course.
    code: str = ""
    # Other codes it answers to, such as a minor's shared GenEd rule ("MINORGENED").
    aliases: list[str] = Field(default_factory=list)
    title: str = ""
    notes: list[str] = Field(default_factory=list)
    status: AuditStatus
    # DARS's "R" marker: it has to be met even when its requirement's count is.
    required: bool = False
    required_credits: float | None = None
    # Courses or sets to complete, in the unit its progress counts.
    required_count: int | None = None
    required_gpa: float | None = None
    max_credits: float | None = None
    earned: Progress | None = None
    in_progress: Progress | None = None
    needs: Progress | None = None
    courses: list[AuditCourse] = Field(default_factory=list)
    # Every course and range under SELECT FROM, in display order.
    select_from: list[str] = Field(default_factory=list)
    # The same options grouped into choices, with their limits.
    choices: list[CourseChoice] = Field(default_factory=list)
    # Courses that can't count toward it.
    not_from: list[str] = Field(default_factory=list)


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

    # "GENED", "MAJOR", "MINOR", "ELECTIVES"; empty for the whole degree.
    category: str = ""
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
    # The page ends with DARS's "END OF ANALYSIS" line, so nothing was cut off.
    analysis_complete: bool = False
    degree_totals: HoursSummary | None = None
    category_totals: list[HoursSummary] = Field(default_factory=list)
    requirements: list[Requirement] = Field(default_factory=list)
