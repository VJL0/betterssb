"""Bulletin program pages beyond the CS major: graduate, engineering and concentration pages,
course descriptions and the programs index's keys."""

from __future__ import annotations

import pytest

from app.modules.degree.course_descriptions import parse_course_blocks
from app.modules.degree.parser import BulletinParser
from app.modules.degree.program_index import parse_program_index
from app.modules.degree.schemas import DegreeProgram, SelectionType
from tests.conftest import FIXTURES_DIR


def _page(name: str) -> DegreeProgram:
    return BulletinParser().parse((FIXTURES_DIR / name).read_text())


@pytest.fixture(scope="module")
def graduate() -> DegreeProgram:
    return _page("bulletin_graduate_ms.html")


@pytest.fixture(scope="module")
def engineering() -> DegreeProgram:
    return _page("bulletin_engineering_bsme.html")


@pytest.fixture(scope="module")
def concentration() -> DegreeProgram:
    return _page("bulletin_concentration_ba.html")


@pytest.fixture(scope="module")
def computer_science() -> DegreeProgram:
    return _page("bulletin_cs_bs.html")


def _items(program: DegreeProgram):
    for category in program.categories:
        for group in category.groups:
            yield from group.items


class TestPageDetails:
    def test_breadcrumb_level_and_college(self, graduate):
        assert graduate.breadcrumb[-1] == "Computer Science MS"
        assert graduate.level == "Graduate and Professional"
        assert graduate.college == "College of Science and Technology"

    @pytest.mark.parametrize(
        ("fixture", "degree"),
        [("graduate", "MS"), ("engineering", "BSME"), ("concentration", "BA")],
    )
    def test_degree_type_from_name(self, fixture, degree, request):
        assert request.getfixturevalue(fixture).degree_type == degree

    def test_tabs(self, graduate, concentration):
        assert graduate.tabs == [
            "Overview",
            "Admission",
            "Program Requirements",
            "Accelerated Programs",
            "Contacts",
        ]
        assert "Optional Concentration" in concentration.tabs

    def test_links_and_notices(self, concentration):
        assert concentration.pdf_url.endswith(
            "/advertising-account-management-ba/advertising-account-management-ba.pdf"
        )
        assert concentration.program_page_url.startswith(
            "https://www.temple.edu/academics/degree-programs/"
        )
        assert concentration.archive_notice.startswith("This is an archived copy")
        assert concentration.applies_to.startswith(
            "These requirements are for students"
        )

    def test_labelled_facts(self, graduate):
        facts = {f.label: f.value for f in graduate.facts}
        assert facts["Time Limit for Degree Completion"] == "5 years"
        assert facts["Letters of Reference"] == "Number Required: 2"
        assert graduate.campus == "Main"

    def test_every_block_is_kept_by_section(self, graduate):
        admission = [s for s in graduate.sections if s.tab == "Admission"]
        scores = next(
            b
            for s in admission
            for b in s.blocks
            if b.kind == "list" and any("TOEFL" in i.text for i in b.items)
        )
        assert scores.items[0].level == 0

    def test_nested_list_levels(self, computer_science):
        items = [
            item
            for s in computer_science.sections
            for b in s.blocks
            if b.kind == "list"
            for item in b.items
        ]
        upper_level = next(i for i in items if "upper-level" in i.text)
        assert upper_level.level > 0

    def test_inline_course_links(self, computer_science):
        courses = {
            code
            for s in computer_science.sections
            for b in s.blocks
            for code in b.courses
        }
        assert "SCTC 1001" in courses

    def test_writing_intensive_choice(self, computer_science):
        (group,) = computer_science.categories[0].groups
        required, second = group.items
        assert required.description == "All students MUST take:"
        assert [o.courses[0].number for o in required.options] == ["3296"]
        assert second.selection_type == SelectionType.SELECT_ONE
        assert second.description == "Second writing-intensive course can be chosen from:"
        assert [o.courses[0].number for o in second.options] == ["4397", "4398"]

    def test_lab_science_title(self, computer_science):
        assert "Laboratory Science Requirements" in computer_science.lab_science_title


class TestContacts:
    def test_undergraduate_contact_lines(self, engineering):
        chair = engineering.contacts[0]
        assert (chair.name, chair.title) == ("Kurosh Darvish", "PhD, Chair")
        assert chair.details == ["Engineering Building, Room 612"]
        assert (chair.email, chair.phone) == (
            "kurosh.darvish@temple.edu",
            "215-204-4307",
        )

    def test_graduate_contact_blocks(self, graduate):
        advisor = next(c for c in graduate.contacts if c.group == "Graduate Advisor")
        assert advisor.name == 'Xiuqi "Cindy" Li'
        assert (advisor.email, advisor.phone) == ("xli@temple.edu", "215-204-2940")
        department = next(
            c for c in graduate.contacts if c.group == "Department Information"
        )
        assert department.name == "Dept. of Computer and Information Sciences"
        assert "Philadelphia, PA 19122-1801" in department.details

    def test_accelerated_programs_by_college(self, engineering):
        msme = next(
            p for p in engineering.accelerated_programs if p.name.endswith("MSME")
        )
        assert msme.group == "College of Engineering"
        assert "/mechanical-engineering-msme/" in msme.url


class TestCourseLists:
    def test_lists_on_every_tab(self, graduate):
        assert [(c.tab, c.name) for c in graduate.categories] == [
            ("Admission", "Admission Requirements and Deadlines"),
            ("Program Requirements", "Program Requirements"),
            (
                "Accelerated Programs",
                "Graduate Courses Approved to Count for Both Undergraduate and Graduate Degrees",
            ),
        ]
        assert graduate.total_credits == "30"

    def test_group_credits_and_notes(self, graduate):
        groups = {g.name: g for g in graduate.categories[1].groups}
        assert groups["Electives"].credits == "18-15"
        assert any("5500" in note for note in groups["Electives"].constraints)

    def test_selection_counts(self, concentration):
        items = {i.description: i for i in _items(concentration)}
        two = items["Select two of the following:"]
        assert (two.selection_type, two.choose_count) == (SelectionType.SELECT_N, 2)
        credits = next(
            i for d, i in items.items() if d.startswith("Select a minimum of 6")
        )
        assert credits.choose_credits == "6"

    def test_worded_options_and_subheadings(self, concentration):
        outside = concentration.categories[-1].groups[-1]
        (choice,) = outside.items
        assert choice.choose_count == 2
        assert choice.options[0].description == "Up to any two foreign language courses"
        anthropology = [o for o in choice.options if o.group == "Anthropology"]
        assert anthropology and all(o.courses for o in anthropology)
        assert any(c.startswith("Note:") for c in outside.constraints)

    def test_corequisites_share_an_option(self, engineering):
        pair = next(
            o for i in _items(engineering) for o in i.options if len(o.courses) == 2
        )
        assert [(c.number, c.title) for c in pair.courses] == [
            ("4422", "Mechanical Vibrations"),
            ("4405", "Vibrations Laboratory"),
        ]

    def test_credit_ranges_in_words(self, engineering):
        topics = next(
            i
            for i in _items(engineering)
            if any(c.number == "4040" for o in i.options for c in o.courses)
        )
        assert topics.credits_range == "1-4"

    def test_footnotes_resolve_to_text(self, graduate):
        independent = next(
            i
            for i in _items(graduate)
            if i.description.startswith("Select at most six")
        )
        assert independent.choose_credits == "6"
        assert independent.footnotes and "advisor" in independent.footnotes[0]


class TestPlans:
    def test_every_plan_grid(self, engineering):
        names = [p.name for p in engineering.suggested_plans]
        assert names == [
            "Bachelor of Science in Mechanical Engineering",
            "Bachelor of Science in Mechanical Engineering - Temple Rome Semester Abroad Option",
        ]
        assert engineering.suggested_plan == engineering.suggested_plans[0]
        assert engineering.suggested_plans[0].subtitle.startswith("Suggested Plan")

    def test_alternatives_titles_and_attributes(self, engineering):
        fall = engineering.suggested_plan.years[0].semesters[0]
        writing = next(
            s
            for s in fall.courses
            if s.options and s.options[0].courses[0].subject == "ENG"
        )
        assert [o.courses[0].number for o in writing.options] == [
            "0802",
            "0812",
            "0902",
        ]
        assert writing.options[0].courses[0].attributes == ["GW"]
        assert writing.options[2].is_honors_variant
        assert writing.course == writing.options[0]

    def test_selection_slot_collects_its_options(self, graduate):
        spring = graduate.suggested_plan.years[0].semesters[1]
        (slot,) = spring.courses
        assert slot.placeholder == "Select one of the following:"
        assert len(slot.options) > 2

    def test_placeholder_attributes(self, concentration):
        slots = [
            s
            for y in concentration.suggested_plan.years
            for sem in y.semesters
            for s in sem.courses
        ]
        literacy = next(
            s for s in slots if s.placeholder == "GenEd Quantitative Literacy Course"
        )
        assert literacy.attributes == ["GQ"]

    def test_year_numbers_come_from_the_page(self, graduate):
        assert [y.year for y in graduate.suggested_plan.years] == [3, 4]


class TestCourseDescriptions:
    @pytest.fixture(scope="class")
    def courses(self):
        blocks = parse_course_blocks(
            (FIXTURES_DIR / "bulletin_courses_cis.html").read_text()
        )
        return {c.code: c for c in blocks}

    def test_title_credits_and_attributes(self, courses):
        design = courses["CIS 3296"]
        assert (design.title, design.credits, design.attributes) == (
            "Software Design",
            "4",
            ["WI"],
        )
        assert design.description.startswith("This course provides direct experience")
        assert design.repeatability.startswith("This course may not be repeated")

    def test_prerequisite_courses(self, courses):
        assert courses["CIS 4398"].prerequisite_courses == [
            "CIS 3238",
            "CIS 3287",
            "CIS 3296",
            "CIS 3223",
        ]

    def test_credit_choices_and_restrictions(self, courses):
        seminar = courses["CIS 2004"]
        assert seminar.credits == "1 or 2"
        (cohort,) = seminar.restrictions
        assert cohort.label == "Cohort Restrictions"
        assert cohort.value.endswith("SCITECHSCH.")

    def test_course_popup_xml(self):
        (course,) = parse_course_blocks(
            (FIXTURES_DIR / "bulletin_course_popup.xml").read_text()
        )
        assert course.code == "CIS 3296"
        assert course.prerequisite_courses == ["CIS 2168", "CIS 3203", "CIS 3207"]


class TestIndexKeys:
    @pytest.fixture(scope="class")
    def index(self):
        return parse_program_index(
            (FIXTURES_DIR / "bulletin_programs_archived.html").read_text(),
            "https://bulletin.temple.edu/archives/x/academic-programs/",
        )

    def test_college_and_degree_keys(self, index):
        colleges = {c.code: c.name for c in index.colleges}
        assert colleges["ST"] == "College of Science & Technology"
        cs_bs = next(
            p
            for p in index.programs
            if p.name == "Computer Science" and p.degree == "BS"
        )
        assert (cs_bs.college_name, cs_bs.degree_name) == (
            "College of Science & Technology",
            "Bachelor of Science",
        )
        assert [d.term for d in index.program_types] == [
            "Major",
            "Minor",
            "Concentration",
            "Certificate",
        ]

    def test_option_marks(self, index):
        advertising = next(
            p for p in index.programs if p.name.startswith("Advertising")
        )
        assert advertising.has_options
        assert not next(
            p for p in index.programs if p.name == "Computer Science"
        ).has_options

    def test_programs_without_pages(self, index):
        unlinked = [p for p in index.programs if not p.url]
        assert unlinked
        assert all(p.degree for p in unlinked)

    def test_introduction_and_links(self, index):
        assert any(
            line.startswith("Asterisks (*) and carets (^)")
            for line in index.introduction
        )
        assert any(link.text == "Class Schedule" for link in index.links)
