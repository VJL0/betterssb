from __future__ import annotations

from enum import StrEnum
from typing import Literal

from pydantic import BaseModel


class SelectionType(StrEnum):
    """How the student fulfills a requirement item."""

    REQUIRED = "required"
    SELECT_ONE = "select_one"
    SELECT_N = "select_n"


class CourseRef(BaseModel):
    """A reference to a single course in the bulletin."""

    subject: str
    number: str
    title: str
    credits: float | None = None
    writing_intensive: bool = False
    bulletin_url: str = ""


class CourseOption(BaseModel):
    """One choosable option within a requirement item.

    A single option can contain multiple corequisite courses that must
    be taken together (e.g. CHEM 1031 & CHEM 1033).
    """

    courses: list[CourseRef]
    is_honors_variant: bool = False


class RequirementItem(BaseModel):
    """A single line-item in a requirement group.

    Covers three patterns found on the bulletin:
      - REQUIRED:   take this exact course (options has 1 entry with 1 course)
      - SELECT_ONE: pick one option from the list (e.g. CIS 1051 or CIS 1951)
      - SELECT_N:   pick N credits worth from the options pool
    """

    selection_type: SelectionType
    description: str = ""
    credits: float | None = None
    credits_range: str = ""
    options: list[CourseOption] = []
    footnotes: list[str] = []


class RequirementGroup(BaseModel):
    """A named cluster of requirement items within a category.

    Examples: "Computer & Information Science courses",
    "Computer Science Electives", "Mathematics", "Laboratory Science courses".
    """

    name: str
    items: list[RequirementItem]
    constraints: list[str] = []


class RequirementCategory(BaseModel):
    """A top-level requirement section.

    Maps to the numbered <ol> items on the bulletin:
      1. University Requirements
      2. College Requirements
      3. Major Requirements for Bachelor of Science
    """

    name: str
    total_credits: str = ""
    description: str = ""
    groups: list[RequirementGroup] = []
    notes: list[str] = []


class LabScienceSequence(BaseModel):
    """A lab-science department sequence (e.g. Biology, Chemistry, Physics).

    The student picks one sequence, then selects one course from A
    and one from B within that sequence.
    """

    department: str
    science_a_label: str = "Lab Science A"
    science_b_label: str = "Lab Science B"
    science_a_options: list[CourseOption] = []
    science_b_options: list[CourseOption] = []
    footnotes: list[str] = []


class PlanCourse(BaseModel):
    """A single slot in the suggested academic plan grid."""

    course: CourseOption | None = None
    placeholder: str = ""
    credits: str = ""


class PlanSemester(BaseModel):
    """One semester in the suggested plan."""

    term: Literal["Fall", "Spring", "Summer"]
    courses: list[PlanCourse]
    total_credits: str = ""


class PlanYear(BaseModel):
    year: int
    semesters: list[PlanSemester]


class SuggestedPlan(BaseModel):
    """The 4-year suggested academic plan grid from the bulletin."""

    years: list[PlanYear]
    total_credits: str = ""
    footnotes: list[str] = []


class DegreeProgram(BaseModel):
    """Complete degree requirements scraped from a Temple Bulletin page.

    This is the top-level structure returned by the parser.
    """

    name: str
    degree_type: str = ""
    program_code: str = ""
    college: str = ""
    bulletin_url: str = ""
    bulletin_year: str = ""
    total_credits: str = ""
    categories: list[RequirementCategory] = []
    lab_science_sequences: list[LabScienceSequence] = []
    suggested_plan: SuggestedPlan | None = None
    distinction_criteria: list[str] = []
    footnotes: list[str] = []
