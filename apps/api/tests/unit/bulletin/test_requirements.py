"""Requirement tables read into requirement trees.

The fixtures are real program pages from the 2026-2027 Bulletin extraction
(`fixtures/requirements/*.json`, plan grids dropped). The synthetic tables
below each pin one wording or layout rule, including the ones a naive reading
gets wrong.
"""

from __future__ import annotations

from decimal import Decimal
from pathlib import Path

import pytest

from app.modules.bulletin.ingest.extract.programs import ProgramPage
from app.modules.bulletin.ingest.extract.tables import (
    CourseListTable,
    Footnote,
    PlanGrid,
    PlanRow,
    PlanTerm,
    TableRow,
)
from app.modules.bulletin.ingest.interpret.requirements import (
    NOTE_LEGEND_ONLY,
    NOTE_OFFERING,
    NOTE_PLAN,
    NOTE_UNCHECKED_WORDING,
    credits,
    interpret_plan,
    interpret_program,
    interpret_table,
    parse_hours,
    selection,
    slot_filter,
    walk,
)
from app.modules.bulletin.ingest.records import Evidence, Locator
from app.modules.bulletin.rules import (
    Interpretation,
    RequirementNode,
    RequirementTree,
    Validation,
)

FIXTURES = Path(__file__).parent / "fixtures" / "requirements"
URL = "https://bulletin.temple.edu/undergraduate/example/"
SHA = "0" * 64


def load(name: str) -> ProgramPage:
    return ProgramPage.model_validate_json((FIXTURES / f"{name}.json").read_text())


def find(tree: RequirementTree | RequirementNode, node_id: str) -> RequirementNode:
    nodes = walk(tree) if isinstance(tree, RequirementTree) else _descend(tree)
    return next(node for node in nodes if node.id == node_id)


def _descend(node: RequirementNode):
    yield node
    for child in node.children:
        yield from _descend(child)


def row(
    kind: str,
    *,
    courses: tuple[str, ...] = (),
    joiner: str | None = None,
    hours: str = "",
    comment: str = "",
    indent: int = 0,
    footnotes: tuple[str, ...] = (),
) -> dict:
    return {
        "kind": kind,
        "courses": list(courses),
        "joiner": joiner,
        "code_text": (" & " if joiner == "and" else " or ").join(courses),
        "title": "Title" if courses else "",
        "hours": hours,
        "comment": comment,
        "indent": indent,
        "footnotes": list(footnotes),
    }


def course(code: str, hours: str = "", indent: int = 0, **extra) -> dict:
    return row("course", courses=(code,), hours=hours, indent=indent, **extra)


def alternative(code: str, indent: int = 0) -> dict:
    return row("alternative", courses=(code,), indent=indent)


def comment(text: str, hours: str = "", indent: int = 0, **extra) -> dict:
    return row("comment", comment=text, hours=hours, indent=indent, **extra)


def header(text: str, hours: str = "", indent: int = 0) -> dict:
    return row("area_header", comment=text, hours=hours, indent=indent)


def total(hours: str) -> dict:
    return row("total", comment="Total Credit Hours", hours=hours)


def table(*rows: dict, footnotes: dict[str, str] | None = None) -> CourseListTable:
    evidence = Evidence(url=URL, sha256=SHA, locator=Locator(xpath="/t"), text="")
    return CourseListTable(
        index=0,
        rows=[
            TableRow(
                index=index,
                classes=[],
                locator=Locator(xpath=f"/t/tr[{index + 1}]", line=index + 1),
                **fields,
            )
            for index, fields in enumerate(rows)
        ],
        footnotes=[
            Footnote(marker=marker, text=text, courses=[], evidence=evidence)
            for marker, text in (footnotes or {}).items()
        ],
        section=["Requirements"],
        tab="requirementstextcontainer",
        evidence=evidence,
    )


# Real programs ---------------------------------------------------------------


class TestComputerScienceBS:
    @pytest.fixture(scope="class")
    def tree(self) -> RequirementTree:
        return interpret_program(load("computer-science-bs"))

    def test_one_root_per_table(self, tree):
        assert [root.id for root in tree.roots] == ["t0", "t1", "t2"]

    def test_major_table_adds_up_to_its_printed_total(self, tree):
        major = tree.roots[1]
        assert (major.min_credits, major.max_credits) == (Decimal(73), Decimal(74))
        # The sum matches, but "Two (2) laboratory science courses" is prose.
        assert major.validation is Validation.UNVERIFIED
        assert NOTE_UNCHECKED_WORDING in major.notes
        assert find(tree, "t1.r0").validation is Validation.STRUCTURALLY_CHECKED
        assert credits(major.model_copy(update={"hours_text": ""})) == (
            Decimal(73),
            Decimal(74),
        )

    def test_honors_alternative_joins_the_course_before_it(self, tree):
        calculus = find(tree, "t1.r57.r58")
        assert calculus.kind == "any"
        assert [child.course for child in calculus.children] == [
            "MATH 1041",
            "MATH 1941",
        ]
        assert calculus.hours_text == "4"

    def test_indented_selection_is_a_choice_of_one(self, tree):
        intro = find(tree, "t1.r0.r2")
        assert intro.kind == "choose"
        assert intro.min_courses == 1
        # CIS 1051 or its honors version, or CIS 1057.
        assert [child.kind for child in intro.children] == ["any", "course"]

    def test_credit_range_selection(self, tree):
        electives = find(tree, "t1.r19.r20")
        assert electives.kind == "choose"
        assert (electives.min_credits, electives.max_credits) == (
            Decimal(15),
            Decimal(16),
        )
        assert len(electives.children) == 35
        # Footnote 2 lets one math course count as an elective; kept verbatim.
        assert electives.footnotes[0].startswith("[2] Students can count one")

    def test_lab_sequences_are_options(self, tree):
        sequences = tree.roots[2]
        assert sequences.kind == "any"
        assert sequences.interpretation is Interpretation.PARTIAL
        chemistry_a = find(tree, "t2.r11.r12")
        assert chemistry_a.kind == "choose" and chemistry_a.min_courses == 1
        lecture_and_lab = chemistry_a.children[0]
        assert lecture_and_lab.kind == "all"
        assert [leaf.course for leaf in lecture_and_lab.children] == [
            "CHEM 1021",
            "CHEM 1023",
        ]

    def test_every_node_cites_its_row(self, tree):
        for node in walk(tree):
            assert node.sources, node.id
            assert node.sources[0].url.endswith("/computer-science-bs/")
            assert node.sources[0].sha256 == tree.roots[0].sources[0].sha256


def test_data_science_minor_offering_legends_are_not_requirements():
    tree = interpret_program(load("data-science-computational-analytics-minor"))
    prerequisites, required, legends = tree.roots
    assert prerequisites.validation is Validation.STRUCTURALLY_CHECKED
    assert required.validation is Validation.STRUCTURALLY_CHECKED
    assert (required.min_credits, required.max_credits) == (Decimal(20), Decimal(22))
    assert all(NOTE_OFFERING in node.notes for node in legends.children)
    assert [root.role for root in tree.roots] == ["requirement", "requirement", "other"]
    assert NOTE_LEGEND_ONLY in legends.notes
    assert credits(legends) == (Decimal(0), Decimal(0))


def test_doctoral_program_keeps_unstated_slots_as_text():
    tree = interpret_program(load("computer-information-science-phd"))
    program = tree.roots[0]
    assert program.validation is Validation.UNVERIFIED
    assert NOTE_UNCHECKED_WORDING in program.notes
    track = find(tree, "t0.r0")
    assert track.kind == "text"
    assert track.interpretation is Interpretation.UNINTERPRETED
    assert track.validation is Validation.UNVERIFIED
    research = find(tree, "t0.r6")
    assert research.kind == "choose" and research.min_credits == Decimal(6)
    assert research.interpretation is Interpretation.PARTIAL
    capped = find(tree, "t1.r8.r9")
    assert capped.kind == "choose" and capped.max_courses == 4


def test_medicine_phases_without_credit_hours():
    tree = interpret_program(load("medicine-md"))
    phases = [child.label for child in tree.roots[0].children]
    assert phases[:4] == [
        "Phase 1 - Year 1",
        "Phase 1 - Year 2",
        "Phase 2 - Year 3",
        "Phase 3 - Year 4",
    ]
    assert tree.roots[0].validation is Validation.UNVERIFIED
    assert "no printed total" in tree.roots[0].notes
    blocks = find(tree, "t0.r16.r30")
    assert blocks.kind == "text" and blocks.label.startswith("Elective (1 block)")


def test_law_subtotals_do_not_fail_a_table():
    tree = interpret_program(load("law-jd"))
    first_year = tree.roots[0]
    assert first_year.validation is Validation.UNVERIFIED
    assert any(note.startswith("worded total 32") for note in first_year.notes)
    writing = find(tree, "t1.r0.r2")
    assert writing.kind == "all"
    assert [child.label for child in writing.children] == [
        "Serial Paper",
        "Research Paper",
    ]


def test_music_composition_adds_up_with_credit_worded_selections():
    tree = interpret_program(load("composition-bm"))
    program = tree.roots[0]
    assert NOTE_UNCHECKED_WORDING in program.notes
    music_studies = find(tree, "t0.r53.r54")
    assert music_studies.kind == "text"  # no rows of its own to choose from
    music_electives = find(tree, "t0.r53.r55")
    assert music_electives.kind == "choose"
    assert music_electives.min_credits == Decimal(3)
    assert music_electives.min_courses is None
    assert [child.course_filter.subjects for child in music_electives.children] == [
        ["MUSC"],
        ["MUED"],
        ["MUST"],
    ]
    free = find(tree, "t0.r53.r59")
    assert free.kind == "course_filter"
    assert free.interpretation is Interpretation.PARTIAL


def test_piano_total_contradiction_is_reported_not_hidden():
    tree = interpret_program(load("performance-piano-bm"))
    program = tree.roots[0]
    assert program.validation is Validation.FAILED
    assert "rows add up to 122-124, table prints 124" in program.notes
    # A failed table marks nothing beneath it as checked.
    assert all(
        node.validation is not Validation.STRUCTURALLY_CHECKED
        for node in _descend(program)
    )


@pytest.mark.parametrize("name", sorted(path.stem for path in FIXTURES.glob("*.json")))
def test_ids_are_unique_and_stable(name):
    program = load(name)
    first, second = interpret_program(program), interpret_program(program)
    ids = [node.id for node in walk(first)]
    assert len(ids) == len(set(ids))
    assert first == second
    for node in walk(first):
        if node.kind == "choose":
            bounds = (
                node.min_courses,
                node.max_courses,
                node.min_credits,
                node.max_credits,
            )
            assert any(bound is not None for bound in bounds), node.id


# Wording and layout rules ----------------------------------------------------


def test_same_indent_selection_stops_at_the_next_header():
    root = interpret_table(
        table(
            comment("All students MUST take:"),
            course("CIS 3296", "4"),
            comment("Second writing-intensive course can be chosen from:"),
            course("CIS 4397", "3"),
            course("CIS 4398", "3"),
        )
    )
    must, chosen = root.children
    assert must.kind == "all" and [c.course for c in must.children] == ["CIS 3296"]
    assert chosen.kind == "any"  # "chosen from" without a count
    assert chosen.interpretation is Interpretation.PARTIAL
    assert [c.course for c in chosen.children] == ["CIS 4397", "CIS 4398"]


def test_selection_without_colon_or_rows_is_a_leaf():
    """'Select two courses in French numbered 2002-4999' names its own slot; it
    must not swallow the row after it."""
    root = interpret_table(
        table(
            course("FREN 2001", "3"),
            comment("Select two courses in French numbered 2002-4999", "6"),
            comment(
                "French Studies Elective numbered 2000+ from any CLA department", "3"
            ),
            total("12"),
        )
    )
    assert [child.kind for child in root.children] == ["course", "text", "text"]
    assert NOTE_UNCHECKED_WORDING in root.notes


def test_select_either_spans_the_groups_after_it():
    root = interpret_table(
        table(
            comment("Select either Residency or Non-Residency Student Teaching", "12"),
            comment("Residency Student Teaching and Seminar"),
            course("EDUC 4001", "12", indent=1),
            comment("Non-Residency Student Teaching and Seminar"),
            course("EDUC 4002", "9", indent=1),
            course("EDUC 4003", "3", indent=1),
            total("12"),
        )
    )
    (either,) = root.children
    assert either.kind == "choose" and either.min_courses == 1
    assert [group.label for group in either.children] == [
        "Residency Student Teaching and Seminar",
        "Non-Residency Student Teaching and Seminar",
    ]
    assert root.validation is Validation.STRUCTURALLY_CHECKED


def test_sum_mismatch_fails_the_table():
    root = interpret_table(
        table(course("CIS 1001", "1"), course("CIS 1068", "4"), total("6"))
    )
    assert root.validation is Validation.FAILED
    assert root.notes == ["rows add up to 5, table prints 6"]


def test_uninterpreted_rows_stay_unverified_in_a_checked_table():
    root = interpret_table(
        table(
            course("CIS 1068", "4"),
            comment("Approved elective with advisor consent", "3"),
            total("7"),
        )
    )
    assert root.validation is Validation.UNVERIFIED
    assert root.notes == [NOTE_UNCHECKED_WORDING]
    assert root.children[0].validation is Validation.STRUCTURALLY_CHECKED
    assert root.interpretation is Interpretation.PARTIAL
    prose = root.children[1]
    assert prose.kind == "text"
    assert prose.validation is Validation.UNVERIFIED


def test_unprinted_footnote_marker_is_noted():
    root = interpret_table(
        table(
            course("CIS 1068", "4", footnotes=("1",)),
            course("CIS 1166", "4", footnotes=("9",)),
            footnotes={"1": "Minimum grade of C required."},
        )
    )
    first, second = root.children
    assert first.footnotes == ["[1] Minimum grade of C required."]
    assert second.footnotes == []
    assert "footnote '9' is not printed under the table" in second.notes


def test_alternative_after_a_lecture_lab_pair():
    root = interpret_table(
        table(
            row("course", courses=("CHEM 1031", "CHEM 1033"), joiner="and", hours="4"),
            alternative("CHEM 1951"),
        )
    )
    (choice,) = root.children
    assert choice.id == "t0.r0"
    assert choice.kind == "any"
    pair, honors = choice.children
    assert pair.id == "t0.r0.r0"
    assert pair.kind == "all"
    assert [leaf.id for leaf in pair.children] == ["t0.r0.r0.c0", "t0.r0.r0.c1"]
    assert honors.course == "CHEM 1951"


def test_heading_hours_below_row_sum_read_as_a_credit_choice():
    root = interpret_table(
        table(
            header("Research Courses", "6"),
            course("CIS 9994", indent=1),
            course("CIS 9998", indent=1),
            course("CIS 9999", indent=1),
            total("6"),
        )
    )
    (research,) = root.children
    assert research.kind == "choose"
    assert research.min_credits == Decimal(6)
    assert research.interpretation is Interpretation.PARTIAL
    assert root.validation is Validation.STRUCTURALLY_CHECKED


def test_area_header_runs_to_the_next_area_header():
    root = interpret_table(
        table(
            header("Mathematics"),
            course("MATH 1041", "4"),
            comment("Select one of the following:", "4"),
            course("MATH 1042", indent=1),
            course("MATH 2101", indent=1),
            header("Physics"),
            course("PHYS 1061", "4"),
            total("12"),
        )
    )
    math, physics = root.children
    assert [child.id for child in math.children] == ["t0.r0.r1", "t0.r0.r2"]
    assert [child.course for child in physics.children] == ["PHYS 1061"]
    assert root.validation is Validation.STRUCTURALLY_CHECKED


def test_bare_course_code_rows():
    root = interpret_table(
        table(
            comment("Select one of the following:", "3"),
            course("ARTH 2105", indent=1),
            comment("ARTH 2111", indent=1),
            comment("JST/REL 3401", indent=1),
        )
    )
    choice = root.children[0]
    single, cross_listed = choice.children[1:]
    assert single.kind == "course" and single.course == "ARTH 2111"
    assert cross_listed.kind == "any"
    assert [leaf.course for leaf in cross_listed.children] == ["JST 3401", "REL 3401"]


def test_option_root_only_when_every_group_names_an_option():
    root = interpret_table(
        table(
            header("Core Courses"),
            course("CIS 1068", "4"),
            header("Data Science Track"),
            course("CIS 3715", "4"),
        )
    )
    assert root.kind == "all"


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("Select one of the following:", {"min_courses": 1}),
        ("Select two from the following:", {"min_courses": 2}),
        ("Select a minimum of one of the following:", {"min_courses": 1}),
        ("Select at least four courses from the following:", {"min_courses": 4}),
        ("Select at most four courses from the following:", {"max_courses": 4}),
        (
            "Select 15-16 credits from the following CS elective courses:",
            {"min_credits": Decimal(15), "max_credits": Decimal(16)},
        ),
        ("Select 6 credits from the following:", {"min_credits": Decimal(6)}),
        (
            "Take a total of three Music Elective credits within the following:",
            {"min_credits": Decimal(3)},
        ),
        ("Select either Residency or Non-Residency", {"min_courses": 1}),
        ("Take any combination of the following three courses", {"uncounted": True}),
        ("Select from the following:", {"uncounted": True}),
    ],
)
def test_selection_wording(text, expected):
    found = selection(text)
    assert found is not None
    for field, value in expected.items():
        assert getattr(found, field) == value


@pytest.mark.parametrize(
    "text", ["Core Courses", "Mathematics", "Two (2) laboratory science courses"]
)
def test_headings_are_not_selections(text):
    assert selection(text) is None


@pytest.mark.parametrize(
    ("text", "expected", "qualified"),
    [
        (
            "GenEd 08xx or 09xx (Human Behavior)",
            {"attributes": ["GB"], "number_min": "0800", "number_max": "0999"},
            False,
        ),
        ("2000+ ARTH elective", {"subjects": ["ARTH"], "number_min": "2000"}, False),
        (
            "ART or DES 2000-2999 Sophomore Studio Elective",
            {"subjects": ["ART", "DES"], "number_min": "2000", "number_max": "2999"},
            True,
        ),
        (
            "ENG 2000 level course",
            {"subjects": ["ENG"], "number_min": "2000", "number_max": "2999"},
            False,
        ),
        ("Free Electives", {}, True),
    ],
)
def test_slot_filters(text, expected, qualified):
    course_filter, notes = slot_filter(text)
    assert course_filter.model_dump(exclude_defaults=True) == expected
    assert bool(notes) is qualified


@pytest.mark.parametrize(
    "text",
    [
        "GenEd 08xx or 09xx (Underwater Basketry)",  # not a GenEd area
        "Any course 2000-level or above from the College of Liberal Arts",
        "Electives",
    ],
)
def test_unrecognised_slots_are_not_guessed(text):
    assert slot_filter(text) is None


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("4", (Decimal(4), Decimal(4))),
        ("15-16", (Decimal(15), Decimal(16))),
        ("1 to 3", (Decimal(1), Decimal(3))),
        ("12-6", None),  # printed backwards in a real table
        ("", None),
        ("varies", None),
    ],
)
def test_parse_hours(text, expected):
    assert parse_hours(text) == expected


def test_clerkship_is_a_clinical_milestone_but_an_elective_is_not():
    root = interpret_table(
        table(
            comment("Internal Medicine Clerkship"),
            comment("Clinical Psychology Electives", "6"),
        )
    )
    clerkship, electives = root.children
    assert clerkship.kind == "milestone" and clerkship.milestone == "clinical"
    assert electives.kind == "text"


def test_cross_listed_cells_become_alternatives_over_single_codes():
    root = interpret_table(
        table(
            course("JST/REL 3411", "3"),
            course("ECON 3507/3597", "3"),
            row(
                "course",
                courses=("BIOL/CHEM/EES/PHYS 3091", "CHEM 1033"),
                joiner="and",
                hours="4",
            ),
            course("Not A Code", "3"),
        )
    )
    jewish, economics, pair, broken = root.children
    assert jewish.kind == "any" and jewish.label == "JST/REL 3411"
    assert "cross-listed under 2 codes" in jewish.notes
    assert [(leaf.id, leaf.course) for leaf in jewish.children] == [
        ("t0.r0.x0", "JST 3411"),
        ("t0.r0.x1", "REL 3411"),
    ]
    assert [leaf.course for leaf in economics.children] == ["ECON 3507", "ECON 3597"]
    seminar = pair.children[0]
    assert seminar.id == "t0.r2.c0" and seminar.kind == "any"
    assert [leaf.id for leaf in seminar.children][-1] == "t0.r2.c0.x3"
    assert broken.kind == "text"
    assert broken.interpretation is Interpretation.UNINTERPRETED
    for node in _descend(root):
        assert node.sources, node.id
        if node.kind == "course":
            assert node.course.count(" ") == 1 and "/" not in node.course


# Roles, curricula and status ------------------------------------------------


def _tabbed(tab: str, section: list[str], *rows: dict) -> CourseListTable:
    return table(*rows).model_copy(update={"tab": tab, "section": section})


@pytest.mark.parametrize(
    ("tab", "section", "role"),
    [
        (
            "admissiontextcontainer",
            ["Admission Requirements and Deadlines"],
            "admission",
        ),
        ("prepharmacytextcontainer", ["Summary of Requirements"], "admission"),
        ("academicplantextcontainer", ["Suggested Academic Plan"], "academic_plan"),
        ("acceleratedprogramstextcontainer", ["Accelerated Programs"], "accelerated"),
        ("textcontainer", ["Overview"], "other"),
        ("requirementstextcontainer", ["Summary of Requirements"], "requirement"),
        (
            "healthoptiontextcontainer",
            ["Summary of Degree Requirements"],
            "requirement",
        ),
    ],
)
def test_root_role_follows_the_tab(tab, section, role):
    root = interpret_table(_tabbed(tab, section, course("CIS 1068", "4")))
    assert root.role == role


def test_legend_only_plan_table_keeps_its_tab_role():
    root = interpret_table(
        _tabbed(
            "academicplantextcontainer",
            ["Suggested Academic Plan"],
            comment("(F) - Fall only course"),
        )
    )
    assert root.role == "academic_plan"


def test_dentistry_curriculum_comes_from_the_plan_grid():
    tree = interpret_program(load("dentistry-dmd"))
    (curriculum,) = tree.roots
    assert curriculum.role == "curriculum"
    assert curriculum.id == "p0"
    assert curriculum.interpretation is Interpretation.PARTIAL
    assert NOTE_PLAN in curriculum.notes
    assert curriculum.hours_text == "152"
    first_fall = curriculum.children[0]
    assert (first_fall.id, first_fall.label, first_fall.hours_text) == (
        "p0.y0.t0",
        "Year 1 Fall",
        "12",
    )
    assert [child.course for child in first_fall.children] == [
        "DENT D100",
        "DENT D102",
        "DENT D150",
        "DENT D162",
        "DENT D163",
    ]
    assert find(tree, "p0.y1.t3").label == "Year 2 Fall"


def test_pharmd_admission_table_is_not_its_curriculum():
    tree = interpret_program(load("pharmacy-pharmd"))
    assert [root.role for root in tree.roots] == ["admission", "curriculum"]
    assert tree.roots[1].id == "p0"


def test_plan_grids_are_ignored_when_a_requirement_table_exists():
    program = load("computer-science-bs")
    assert all(root.role != "curriculum" for root in interpret_program(program).roots)


def test_plan_selection_takes_the_hourless_rows_after_it():
    def plan_row(kind, courses=(), code_text="", title="", hours=""):
        return PlanRow(
            kind=kind,
            courses=list(courses),
            code_text=code_text,
            title=title,
            hours=hours,
            footnotes=[],
            locator=Locator(xpath="/p/tr", line=1),
        )

    evidence = Evidence(url=URL, sha256=SHA, locator=Locator(xpath="/p"), text="")
    grid = PlanGrid(
        index=0,
        section=["Program Requirements"],
        tab="programrequirementstextcontainer",
        terms=[
            PlanTerm(
                year="Year 1",
                term="Fall",
                rows=[
                    plan_row("course", ["CIS 1001"], "CIS 1001", hours="1"),
                    plan_row(
                        "comment", code_text="Select one of the following:", hours="4"
                    ),
                    plan_row(
                        "course", ["CIS 1051", "CIS 1951"], "CIS 1051 or CIS 1951"
                    ),
                    plan_row("course", ["CIS 1057"], "CIS 1057"),
                    plan_row("course", ["MATH 1041"], "MATH 1041", hours="4"),
                    plan_row("comment", code_text="Elective", hours="3"),
                    plan_row("term_total", title="Credit Hours", hours="12"),
                ],
            )
        ],
        total_hours="12",
        footnotes=[],
        evidence=evidence,
    )
    term = interpret_plan(grid).children[0]
    first, choice, calculus, elective = term.children
    assert first.course == "CIS 1001"
    assert choice.kind == "choose" and choice.min_courses == 1
    assert [child.id for child in choice.children] == [
        "p0.y0.t0.r1.r2",
        "p0.y0.t0.r1.r3",
    ]
    assert choice.children[0].kind == "any"
    assert calculus.course == "MATH 1041"
    assert elective.kind == "text"
    assert term.hours_text == "12"


def test_at_most_credits_is_a_credit_cap():
    tree = interpret_program(load("computational-data-science-ms"))
    capped = find(tree, "t1.r8.r28")
    assert capped.kind == "choose"
    assert capped.max_credits == Decimal(3)
    assert capped.max_courses is None
    assert [root.role for root in tree.roots] == [
        "admission",
        "requirement",
        "accelerated",
    ]


def test_titles_stating_conditions_are_partial():
    tree = interpret_program(load("podiatric-medicine-dpm"))
    orthopedics = find(tree, "t0.r52.r64.r65")
    assert orthopedics.interpretation is Interpretation.PARTIAL
    assert any("cannot be taken in addition to" in note for note in orthopedics.notes)


@pytest.mark.parametrize(
    ("title", "partial"),
    [
        ("Intermediate Corporate Finance (must be completed at Temple)", True),
        ("Topics in Music Theory (take 2 times for 2 credits each)", True),
        ("Data Structures", False),
        ("Times and Places of Early Modern Europe", False),
    ],
)
def test_condition_wording(title, partial):
    root = interpret_table(
        table(row("course", courses=("FIN 3504",), hours="3") | {"title": title})
    )
    node = root.children[0]
    assert (node.interpretation is Interpretation.PARTIAL) is partial


def test_subject_codes_are_not_condition_words():
    root = interpret_table(table(comment("MUST 1000-4999", "3")))
    assert root.children[0].interpretation is Interpretation.INTERPRETED


def test_footnote_conditions_are_partial():
    root = interpret_table(
        table(
            course("FIN 3504", "3", footnotes=("1",)),
            footnotes={"1": "This course must be completed at Temple."},
        )
    )
    node = root.children[0]
    assert node.interpretation is Interpretation.PARTIAL
    assert node.notes[-1].startswith("footnote condition not captured")


@pytest.mark.parametrize(
    ("code", "number_min", "number_max"),
    [("CIS 4X9X", "4090", "4999"), ("BIOL 4XXX", "4000", "4999")],
)
def test_wildcard_codes_become_number_ranges(code, number_min, number_max):
    root = interpret_table(table(course(code, "3"), comment(code, "3")))
    for node in root.children:
        assert node.kind == "course_filter"
        assert node.course_filter.number_min == number_min
        assert node.course_filter.number_max == number_max
        assert node.interpretation is Interpretation.PARTIAL


@pytest.mark.parametrize("name", sorted(path.stem for path in FIXTURES.glob("*.json")))
def test_statuses_agree_with_descendants(name):
    def descendants(node):
        for child in node.children:
            yield child
            yield from descendants(child)

    for node in walk(interpret_program(load(name))):
        below = list(descendants(node))
        if node.interpretation is Interpretation.INTERPRETED:
            assert all(
                child.interpretation is Interpretation.INTERPRETED for child in below
            ), node.id
        if node.validation is Validation.STRUCTURALLY_CHECKED:
            assert all(
                child.interpretation is not Interpretation.UNINTERPRETED
                for child in below
            ), node.id
