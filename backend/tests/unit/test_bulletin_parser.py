from __future__ import annotations

import pytest

from app.domains.degree.schemas import DegreeProgram, SelectionType
from app.domains.degree.service import BulletinParser


@pytest.fixture()
def parser() -> BulletinParser:
    return BulletinParser()


@pytest.fixture()
def parsed_cs(parser, bulletin_html) -> DegreeProgram:
    return parser.parse(
        bulletin_html,
        url="https://bulletin.temple.edu/undergraduate/science-technology/computer-science-bs/",
    )


@pytest.fixture()
def parsed_cybr(parser, bulletin_cybr_html) -> DegreeProgram:
    return parser.parse(
        bulletin_cybr_html,
        url="https://bulletin.temple.edu/undergraduate/science-technology/cybersecurity-bs/",
    )


# ── helpers ──────────────────────────────────────────────────────────────────


def _all_items(program: DegreeProgram):
    for cat in program.categories:
        for group in cat.groups:
            yield from group.items


def _group_names(program: DegreeProgram) -> list[str]:
    return [g.name for c in program.categories for g in c.groups]


# ═══════════════════════════════════════════════════════════════════════════════
#  Computer Science BS
# ═══════════════════════════════════════════════════════════════════════════════


class TestCSMetadata:
    def test_program_name(self, parsed_cs):
        assert "Computer Science" in parsed_cs.name

    def test_bulletin_url(self, parsed_cs):
        assert parsed_cs.bulletin_url.startswith("https://bulletin.temple.edu")

    def test_degree_type(self, parsed_cs):
        assert parsed_cs.degree_type == "BS"

    def test_college(self, parsed_cs):
        assert "Science and Technology" in parsed_cs.college

    def test_program_code(self, parsed_cs):
        assert parsed_cs.program_code != ""

    def test_bulletin_year(self, parsed_cs):
        assert parsed_cs.bulletin_year != ""


class TestCSCategories:
    def test_has_categories(self, parsed_cs):
        assert len(parsed_cs.categories) >= 1

    def test_major_requirements_present(self, parsed_cs):
        names = [c.name for c in parsed_cs.categories]
        assert any("Major" in n for n in names)

    def test_writing_intensive_present(self, parsed_cs):
        names = [c.name for c in parsed_cs.categories]
        assert any("Writing" in n for n in names)

    def test_groups_exist(self, parsed_cs):
        for cat in parsed_cs.categories:
            assert len(cat.groups) >= 1

    def test_items_exist_in_groups(self, parsed_cs):
        for cat in parsed_cs.categories:
            for group in cat.groups:
                assert len(group.items) >= 1, f"Group '{group.name}' has no items"


class TestCSRequirementItems:
    def test_required_items_have_options(self, parsed_cs):
        for item in _all_items(parsed_cs):
            if item.selection_type == SelectionType.REQUIRED:
                assert len(item.options) >= 1

    def test_select_one_items_have_multiple_options(self, parsed_cs):
        select_ones = [i for i in _all_items(parsed_cs) if i.selection_type == SelectionType.SELECT_ONE]
        assert len(select_ones) > 0, "Expected at least one SELECT_ONE item"
        for item in select_ones:
            assert len(item.options) >= 2, f"SELECT_ONE '{item.description}' should have >= 2 options"

    def test_options_have_courses(self, parsed_cs):
        for item in _all_items(parsed_cs):
            for opt in item.options:
                assert len(opt.courses) >= 1

    def test_course_refs_have_subject(self, parsed_cs):
        for item in _all_items(parsed_cs):
            for opt in item.options:
                for ref in opt.courses:
                    assert ref.subject != "", f"Missing subject: {ref}"

    def test_cs_electives_group_exists(self, parsed_cs):
        names = _group_names(parsed_cs)
        assert any("Elective" in n for n in names)


class TestCSLabSciences:
    def test_lab_sequences_present(self, parsed_cs):
        assert len(parsed_cs.lab_science_sequences) >= 1

    def test_sequence_departments(self, parsed_cs):
        depts = {s.department.lower() for s in parsed_cs.lab_science_sequences}
        assert any("biology" in d for d in depts)
        assert any("chemistry" in d for d in depts)
        assert any("physics" in d for d in depts)

    def test_sequence_has_options(self, parsed_cs):
        for seq in parsed_cs.lab_science_sequences:
            has_options = seq.science_a_options or seq.science_b_options
            assert has_options, f"Sequence '{seq.department}' has no options"


class TestCSSuggestedPlan:
    def test_plan_exists(self, parsed_cs):
        assert parsed_cs.suggested_plan is not None

    def test_plan_has_four_years(self, parsed_cs):
        plan = parsed_cs.suggested_plan
        assert plan is not None
        assert len(plan.years) == 4

    def test_years_have_semesters(self, parsed_cs):
        plan = parsed_cs.suggested_plan
        assert plan is not None
        for year in plan.years:
            assert len(year.semesters) >= 1

    def test_year_numbers_sequential(self, parsed_cs):
        plan = parsed_cs.suggested_plan
        assert plan is not None
        year_nums = [y.year for y in plan.years]
        assert year_nums == [1, 2, 3, 4]


class TestCSFootnotes:
    def test_footnotes_present(self, parsed_cs):
        assert len(parsed_cs.footnotes) >= 1


# ═══════════════════════════════════════════════════════════════════════════════
#  Cybersecurity BS
# ═══════════════════════════════════════════════════════════════════════════════


class TestCybrMetadata:
    def test_program_name(self, parsed_cybr):
        assert "Cybersecurity" in parsed_cybr.name

    def test_bulletin_url(self, parsed_cybr):
        assert "cybersecurity" in parsed_cybr.bulletin_url

    def test_degree_type(self, parsed_cybr):
        assert parsed_cybr.degree_type == "BS"

    def test_college(self, parsed_cybr):
        assert "Science and Technology" in parsed_cybr.college

    def test_program_code(self, parsed_cybr):
        assert parsed_cybr.program_code != ""

    def test_bulletin_year(self, parsed_cybr):
        assert parsed_cybr.bulletin_year != ""


class TestCybrCategories:
    def test_has_categories(self, parsed_cybr):
        assert len(parsed_cybr.categories) >= 1

    def test_major_requirements_present(self, parsed_cybr):
        names = [c.name for c in parsed_cybr.categories]
        assert any("Major" in n for n in names)

    def test_groups_exist(self, parsed_cybr):
        for cat in parsed_cybr.categories:
            assert len(cat.groups) >= 1

    def test_items_exist_in_groups(self, parsed_cybr):
        for cat in parsed_cybr.categories:
            for group in cat.groups:
                assert len(group.items) >= 1, f"Group '{group.name}' has no items"

    def test_cybr_specific_groups(self, parsed_cybr):
        names = _group_names(parsed_cybr)
        joined = " ".join(names).lower()
        assert "cybersecurity" in joined or "elective" in joined


class TestCybrRequirementItems:
    def test_required_items_have_options(self, parsed_cybr):
        for item in _all_items(parsed_cybr):
            if item.selection_type == SelectionType.REQUIRED:
                assert len(item.options) >= 1

    def test_select_one_items_have_multiple_options(self, parsed_cybr):
        select_ones = [i for i in _all_items(parsed_cybr) if i.selection_type == SelectionType.SELECT_ONE]
        assert len(select_ones) > 0, "Expected at least one SELECT_ONE item"
        for item in select_ones:
            assert len(item.options) >= 2, f"SELECT_ONE '{item.description}' should have >= 2 options"

    def test_options_have_courses(self, parsed_cybr):
        for item in _all_items(parsed_cybr):
            for opt in item.options:
                assert len(opt.courses) >= 1

    def test_course_refs_have_subject(self, parsed_cybr):
        for item in _all_items(parsed_cybr):
            for opt in item.options:
                for ref in opt.courses:
                    assert ref.subject != "", f"Missing subject: {ref}"


class TestCybrLabSciences:
    def test_lab_sequences_present(self, parsed_cybr):
        assert len(parsed_cybr.lab_science_sequences) >= 1

    def test_sequence_departments(self, parsed_cybr):
        depts = {s.department.lower() for s in parsed_cybr.lab_science_sequences}
        assert any("biology" in d for d in depts)

    def test_sequence_has_options(self, parsed_cybr):
        for seq in parsed_cybr.lab_science_sequences:
            has_options = seq.science_a_options or seq.science_b_options
            assert has_options, f"Sequence '{seq.department}' has no options"


class TestCybrSuggestedPlan:
    def test_plan_exists(self, parsed_cybr):
        assert parsed_cybr.suggested_plan is not None

    def test_plan_has_four_years(self, parsed_cybr):
        plan = parsed_cybr.suggested_plan
        assert plan is not None
        assert len(plan.years) == 4

    def test_year_numbers_sequential(self, parsed_cybr):
        plan = parsed_cybr.suggested_plan
        assert plan is not None
        year_nums = [y.year for y in plan.years]
        assert year_nums == [1, 2, 3, 4]


class TestCybrFootnotes:
    def test_footnotes_present(self, parsed_cybr):
        assert len(parsed_cybr.footnotes) >= 1


# ═══════════════════════════════════════════════════════════════════════════════
#  Cross-program consistency
# ═══════════════════════════════════════════════════════════════════════════════


class TestCrossProgram:
    def test_both_in_same_college(self, parsed_cs, parsed_cybr):
        assert parsed_cs.college == parsed_cybr.college

    def test_both_bs_degrees(self, parsed_cs, parsed_cybr):
        assert parsed_cs.degree_type == parsed_cybr.degree_type == "BS"

    def test_same_bulletin_year(self, parsed_cs, parsed_cybr):
        assert parsed_cs.bulletin_year == parsed_cybr.bulletin_year

    def test_different_program_codes(self, parsed_cs, parsed_cybr):
        assert parsed_cs.program_code != parsed_cybr.program_code

    def test_lab_sequences_same_departments(self, parsed_cs, parsed_cybr):
        cs_depts = {s.department for s in parsed_cs.lab_science_sequences}
        cybr_depts = {s.department for s in parsed_cybr.lab_science_sequences}
        shared = cs_depts & cybr_depts
        assert len(shared) >= 1, "Programs should share at least one lab science department"


# ═══════════════════════════════════════════════════════════════════════════════
#  Edge cases
# ═══════════════════════════════════════════════════════════════════════════════


class TestEdgeCases:
    def test_empty_html(self, parser):
        result = parser.parse("<html><head><title>Empty</title></head><body></body></html>")
        assert result.name == "Empty"
        assert result.categories == []

    def test_no_title(self, parser):
        result = parser.parse("<html><body></body></html>")
        assert result.name == ""

    def test_missing_requirements_container(self, parser):
        html = "<html><head><title>Test</title></head><body><p>No reqs</p></body></html>"
        result = parser.parse(html)
        assert result.categories == []
        assert result.suggested_plan is None
