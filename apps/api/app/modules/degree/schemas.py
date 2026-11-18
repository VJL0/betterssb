from __future__ import annotations

from enum import StrEnum
from typing import Literal

from pydantic import Field

from app.shared.schemas import BaseSchema


class SelectionType(StrEnum):
    """How the student fulfills a requirement item."""

    REQUIRED = "required"
    SELECT_ONE = "select_one"
    SELECT_N = "select_n"


class CourseRef(BaseSchema):
    """A reference to a single course in the bulletin."""

    subject: str
    number: str
    title: str
    credits: float | None = None
    attributes: list[str] = Field(default_factory=list)
    """GenEd and other attribute codes the page tags it with, e.g. "GW", "WI"."""
    writing_intensive: bool = False
    bulletin_url: str = ""


class CourseOption(BaseSchema):
    """One choosable option within a requirement item.

    A single option can contain multiple corequisite courses that must
    be taken together (e.g. CHEM 1031 & CHEM 1033). An option with no
    courses is described in words ("Up to any two foreign language
    courses") or by a placeholder code ("CIS 4X9X").
    """

    courses: list[CourseRef]
    description: str = ""
    group: str = ""
    """The subheading it's listed under in a long selection, e.g. "Anthropology"."""
    is_honors_variant: bool = False


class RequirementItem(BaseSchema):
    """A single line-item in a requirement group.

    Covers three patterns found on the bulletin:
      - REQUIRED:   take this exact course (options has 1 entry with 1 course)
      - SELECT_ONE: pick one option from the list (e.g. CIS 1051 or CIS 1951)
      - SELECT_N:   pick N courses or N credits worth from the options pool
    """

    selection_type: SelectionType
    description: str = ""
    credits: float | None = None
    credits_range: str = ""
    choose_count: int | None = None
    """How many options to pick ("Select two of the following" → 2)."""
    choose_credits: str = ""
    """How many credits to pick ("Select 15-16 credits" → "15-16")."""
    options: list[CourseOption] = Field(default_factory=list)
    footnotes: list[str] = Field(default_factory=list)


class RequirementGroup(BaseSchema):
    """A named cluster of requirement items within a category.

    Examples: "Computer & Information Science courses",
    "Computer Science Electives", "Mathematics", "Laboratory Science courses".
    """

    name: str
    credits: str = ""
    """Credits the group's header row gives, e.g. "18-15" for "Electives"."""
    items: list[RequirementItem]
    constraints: list[str] = Field(default_factory=list)
    """Note rows in the group ("Note: Satisfying the GenEd World Society…")."""


class RequirementCategory(BaseSchema):
    """One course list on the page, named by where it sits.

    The name is the requirement summary item or heading above the list
    ("Major Requirements for Bachelor of Science (73-74 s.h.)"), and the
    description is the sentence that introduces it.
    """

    name: str
    tab: str = ""
    """The page tab it's on, e.g. "Requirements", "Academic Plan"."""
    total_credits: str = ""
    description: str = ""
    groups: list[RequirementGroup] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)
    """The list's footnotes, in order."""


class LabScienceSequence(BaseSchema):
    """A lab-science department sequence (e.g. Biology, Chemistry, Physics).

    The student picks one sequence, then selects one course from A
    and one from B within that sequence.
    """

    department: str
    science_a_label: str = "Lab Science A"
    science_b_label: str = "Lab Science B"
    science_a_options: list[CourseOption] = Field(default_factory=list)
    science_b_options: list[CourseOption] = Field(default_factory=list)
    footnotes: list[str] = Field(default_factory=list)


class PlanCourse(BaseSchema):
    """A single slot in the suggested academic plan grid."""

    course: CourseOption | None = None
    """The first option, kept for readers that show one course per slot."""
    options: list[CourseOption] = Field(default_factory=list)
    """Every option for the slot: alternatives ("MATH 1041 or MATH 1941") or the courses listed under "Select one of the following:"."""
    placeholder: str = ""
    """The slot's words when it isn't a course: "Elective", "GenEd Breadth Course", "Select one of the following:"."""
    credits: str = ""
    attributes: list[str] = Field(default_factory=list)
    """Attribute codes on a placeholder, e.g. "GQ" on "GenEd Quantitative Literacy Course"."""
    footnotes: list[str] = Field(default_factory=list)


class PlanSemester(BaseSchema):
    """One semester in the suggested plan."""

    term: str
    courses: list[PlanCourse]
    total_credits: str = ""


class PlanYear(BaseSchema):
    year: int
    semesters: list[PlanSemester]


class SuggestedPlan(BaseSchema):
    """A suggested academic plan grid from the bulletin."""

    name: str = ""
    """The heading above the grid, e.g. "Bachelor of Science in Computer Science"."""
    subtitle: str = ""
    """A subheading, e.g. "Suggested Plan for New Students Starting in the 2024-2025 Academic Year"."""
    years: list[PlanYear]
    total_credits: str = ""
    footnotes: list[str] = Field(default_factory=list)


class Link(BaseSchema):
    text: str
    url: str


class ListItem(BaseSchema):
    text: str
    level: int = 0
    """Nesting depth, 0 for a top-level item."""


class PageBlock(BaseSchema):
    """A paragraph, list or plain table in one of the page's tabs."""

    kind: Literal["paragraph", "list", "table"]
    label: str = ""
    """A bold lead-in such as "Campus Location" or "Application Deadline"."""
    lines: list[str] = Field(default_factory=list)
    """A paragraph's lines (split where the page breaks them), without the label."""
    items: list[ListItem] = Field(default_factory=list)
    rows: list[list[str]] = Field(default_factory=list)
    links: list[Link] = Field(default_factory=list)
    courses: list[str] = Field(default_factory=list)
    """Course codes linked in the text ("SCTC 1001")."""


class PageSection(BaseSchema):
    """The content under one heading of a page tab."""

    tab: str
    headings: list[str] = Field(default_factory=list)
    """Headings from the tab's top down to this section, e.g. ["Accelerated Programs"]."""
    blocks: list[PageBlock] = Field(default_factory=list)


class Fact(BaseSchema):
    """A labelled line from the page, such as "Campus Location: Main"."""

    tab: str
    label: str
    value: str


class Contact(BaseSchema):
    name: str = ""
    title: str = ""
    """What follows the name on its line, e.g. "Chair", "PhD, Faculty Advisor"."""
    group: str = ""
    """The heading it's listed under, such as "Temple Japan Campus" or "Admissions"."""
    details: list[str] = Field(default_factory=list)
    email: str = ""
    phone: str = ""
    url: str = ""


class LinkedProgram(BaseSchema):
    """A program the page points to, such as an accelerated +1 master's."""

    name: str
    url: str
    group: str = ""
    """The college or heading it's listed under."""


class ProgramLevel(StrEnum):
    """The Bulletin index column a program is listed under."""

    UNDERGRADUATE = "undergraduate"
    GRADUATE = "graduate"
    PROFESSIONAL = "professional"


class BulletinProgram(BaseSchema):
    """One degree, minor or certificate from a Bulletin's academic programs index."""

    name: str
    degree: str
    note: str = ""
    """The index's parenthetical, e.g. "not currently accepting applications"."""
    level: ProgramLevel
    college: str = ""
    """The index's school or college code, e.g. "ST" for Science and Technology."""
    college_name: str = ""
    """The index key's name for that code, e.g. "College of Science & Technology"."""
    degree_name: str = ""
    """The degree symbol's meaning, e.g. "Bachelor of Science" for "BS"."""
    has_options: bool = False
    """The index marks programs with emphasis or concentration options with * or ^."""
    url: str = ""
    """Empty for a program the index lists without a page ("Diploma", "PhD/MD")."""


class CodeName(BaseSchema):
    code: str
    name: str


class Definition(BaseSchema):
    term: str
    description: str


class BulletinProgramIndex(BaseSchema):
    """Every program in one Bulletin year, with the page they were read from."""

    bulletin_year: str
    requested_year: str = ""
    """The year asked for. When that year's Bulletin isn't online, an earlier year stands in and `bulletin_year` says which."""
    source_url: str
    programs: list[BulletinProgram]
    colleges: list[CodeName] = Field(default_factory=list)
    """The index's keys: school and college codes, and degree symbols."""
    degrees: list[CodeName] = Field(default_factory=list)
    program_types: list[Definition] = Field(default_factory=list)
    """What a major, minor, concentration and certificate are."""
    introduction: list[str] = Field(default_factory=list)
    """The paragraphs above the chart, and the pages they link."""
    links: list[Link] = Field(default_factory=list)


class CourseDescription(BaseSchema):
    """A course's entry in the Bulletin's course descriptions."""

    code: str
    title: str
    credits: str = ""
    """"3", or a range like "1 to 4"."""
    description: str = ""
    attributes: list[str] = Field(default_factory=list)
    """Course attribute codes, e.g. "GQ", "WI", "HO"."""
    repeatability: str = ""
    prerequisites: str = ""
    corequisites: str = ""
    prerequisite_courses: list[str] = Field(default_factory=list)
    """Course codes linked in the prerequisites and corequisites."""
    corequisite_courses: list[str] = Field(default_factory=list)
    restrictions: list[Fact] = Field(default_factory=list)
    """Enrollment restrictions by kind, e.g. "Field of Study Restrictions"."""
    other: list[Fact] = Field(default_factory=list)
    """Other labelled lines the entry has."""
    bulletin_url: str = ""


class BulletinSubjectIndex(BaseSchema):
    """Every course subject in one Bulletin year, from its course descriptions index."""

    bulletin_year: str
    requested_year: str = ""
    """The year asked for, when an earlier year stands in (see BulletinProgramIndex)."""
    source_url: str
    subjects: list[CodeName]


class SubjectCourses(BaseSchema):
    """Every course one subject lists in a Bulletin year, undergraduate and graduate."""

    bulletin_year: str
    subject: str
    source_url: str
    courses: list[CourseDescription]


class DegreeProgram(BaseSchema):
    """Complete degree requirements scraped from a Temple Bulletin page.

    This is the top-level structure returned by the parser.
    """

    name: str
    degree_type: str = ""
    program_code: str = ""
    college: str = ""
    level: str = ""
    """"Undergraduate" or "Graduate and Professional", from the breadcrumb."""
    breadcrumb: list[str] = Field(default_factory=list)
    campus: str = ""
    bulletin_url: str = ""
    bulletin_year: str = ""
    pdf_url: str = ""
    program_page_url: str = ""
    """The program's page on temple.edu ("Learn more about…")."""
    archive_notice: str = ""
    """The archive banner, when the page is from a past Bulletin."""
    applies_to: str = ""
    """Who the requirements apply to ("…students who matriculated in academic year 2024-2025")."""
    total_credits: str = ""
    tabs: list[str] = Field(default_factory=list)
    overview: list[str] = Field(default_factory=list)
    facts: list[Fact] = Field(default_factory=list)
    categories: list[RequirementCategory] = Field(default_factory=list)
    lab_science_title: str = ""
    """The heading over the lab science sequences."""
    lab_science_sequences: list[LabScienceSequence] = Field(default_factory=list)
    suggested_plan: SuggestedPlan | None = None
    """The first of `suggested_plans`."""
    suggested_plans: list[SuggestedPlan] = Field(default_factory=list)
    distinction_criteria: list[str] = Field(default_factory=list)
    footnotes: list[str] = Field(default_factory=list)
    contacts: list[Contact] = Field(default_factory=list)
    accelerated_programs: list[LinkedProgram] = Field(default_factory=list)
    sections: list[PageSection] = Field(default_factory=list)
    """Every heading, paragraph, list and plain table on the page, by tab."""
