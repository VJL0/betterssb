"""Catalog interpreters on trimmed real 2026-2027 records (see fixtures/catalog)."""

from __future__ import annotations

from functools import cache
from pathlib import Path

import pytest

from app.modules.bulletin.ingest.extract.classify import PageKind
from app.modules.bulletin.ingest.extract.program_index import ProgramIndex
from app.modules.bulletin.ingest.extract.programs import ProgramPage
from app.modules.bulletin.ingest.extract.run import ExtractedPage
from app.modules.bulletin.ingest.interpret import catalog

FIXTURES = Path(__file__).parent / "fixtures" / "catalog"
EDITION = "2026-2027"
BASE = "https://bulletin.temple.edu"


@cache
def pages() -> dict[str, ExtractedPage]:
    with (FIXTURES / "pages.jsonl").open() as handle:
        records = [ExtractedPage.model_validate_json(line) for line in handle]
    return {record.document.url: record for record in records}


@cache
def index() -> ProgramIndex:
    return ProgramIndex.model_validate_json(
        (FIXTURES / "program_index.json").read_text()
    )


@cache
def programs() -> dict[str, ProgramPage]:
    with (FIXTURES / "programs.jsonl").open() as handle:
        records = [ProgramPage.model_validate_json(line) for line in handle]
    return {record.url: record for record in records}


def units() -> list[catalog.AcademicUnit]:
    return catalog.academic_units(pages().values(), EDITION, index())


def page(path: str) -> ExtractedPage:
    return pages()[BASE + path].model_copy(deep=True)


def describe(path: str) -> catalog.ProgramFacts:
    return catalog.describe_program(programs()[BASE + path], index(), EDITION, units())


# Policy sections


def test_sections_split_at_headings_without_repeating_them() -> None:
    sections = catalog.policy_sections(
        page("/undergraduate/academic-policies/repeating-course/"), EDITION
    )
    paths = [section.heading_path[-1] for section in sections]
    assert paths == [
        "Repeating a Course (Undergraduate and Graduate)",
        "Scope of Policy & Rationale",
        "Definitions",
        "Policy Statement",
        "Notes",
    ]
    assert all(
        block.kind != "heading" for section in sections for block in section.blocks
    )
    assert [section.index for section in sections] == list(range(len(sections)))


def test_generic_headings_take_the_page_topic() -> None:
    sections = catalog.policy_sections(
        page("/undergraduate/academic-policies/repeating-course/"), EDITION
    )
    assert {section.topic for section in sections} == {"repeat"}


def test_section_blocks_cite_their_snapshot() -> None:
    source = page("/undergraduate/academic-policies/repeating-course/")
    section = catalog.policy_sections(source, EDITION)[3]
    for block in section.blocks:
        assert block.evidence.url == source.document.url
        assert block.evidence.sha256 == source.document.sha256
        assert block.evidence.text == block.text
        assert block.evidence.locator.xpath


def test_faculty_tabs_are_skipped() -> None:
    source = page("/undergraduate/science-technology/")
    for block in source.document.blocks:
        block.locator.tab = "facultytextcontainer"
    assert catalog.policy_sections(source, EDITION) == []


def test_pages_that_arent_policy_like_give_no_sections() -> None:
    source = page("/undergraduate/academic-policies/repeating-course/")
    source.kind = PageKind.PROGRAM
    assert catalog.policy_sections(source, EDITION) == []


def test_section_level_follows_the_path() -> None:
    graduate = catalog.policy_sections(page("/graduate/graduate-policies/"), EDITION)
    undergraduate = catalog.policy_sections(
        page("/undergraduate/academic-policies/repeating-course/"), EDITION
    )
    assert {section.level for section in graduate} == {"graduate"}
    assert {section.level for section in undergraduate} == {"undergraduate"}


def test_numbered_graduate_policy_becomes_clauses() -> None:
    sections = catalog.policy_sections(page("/graduate/graduate-policies/"), EDITION)
    currency = next(section for section in sections if section.tab_label == "02.25")
    assert currency.topic == "time_limit"
    clauses = {clause.number: clause for clause in currency.clauses}
    assert clauses["02.25"].title == "CURRENCY AND TIME LIMITS"
    enrollment = clauses["02.25.11"]
    assert enrollment.title == "Continuous Enrollment/Registration"
    assert enrollment.topic == "continuous_enrollment"
    assert enrollment.text.startswith("To remain in Academic Good Standing")
    assert clauses["02.25.11.01"].parent == "02.25.11"
    assert clauses["02.25.11.01"].topic == "continuous_enrollment"
    # A heading row with sub-clauses and no text of its own is a title.
    assert clauses["02.25.15"].title == "Time Limits for a Degree"
    assert clauses["02.25.15.03"].text == (
        "The time limit for a doctoral degree is seven years."
    )
    assert clauses["02.25.15.03"].topic == "time_limit"


def test_clause_inherits_from_nearest_printed_ancestor() -> None:
    sections = catalog.policy_sections(page("/graduate/graduate-policies/"), EDITION)
    currency = next(section for section in sections if section.tab_label == "02.25")
    clauses = {clause.number: clause for clause in currency.clauses}
    # Temple prints 02.25.14.02.02 without a 02.25.14.02 row.
    assert "02.25.14.02" not in clauses
    assert clauses["02.25.14.02.02"].topic == "leave"


def test_sentences_ending_in_a_colon_are_not_titles() -> None:
    clauses = catalog.policy_clauses(
        "02.25.12.03 | To be designated full-time, a student must register for:\n"
        " | 9284 - Music Doctoral Performance",
        "registration",
    )
    assert clauses[0].title == ""
    assert clauses[0].text.endswith("9284 - Music Doctoral Performance")


@pytest.mark.parametrize(
    ("heading_path", "page_heading", "expected"),
    [
        (["Policy Statement"], "Leave of Absence", "leave"),
        (["Notes"], "Grades and Grading", "grading"),
        (["Waiver"], "Science & Technology (GS)", "other"),
        (["Doctoral Dissertation"], "Graduate School Policies", "thesis_dissertation"),
        ([], "Attendance", "other"),
    ],
)
def test_topic_rules(heading_path: list[str], page_heading: str, expected: str) -> None:
    url = f"{BASE}/undergraduate/academic-policies/x/"
    assert catalog.classify_topic(heading_path, page_heading, url) == expected


def test_topic_falls_back_to_the_path() -> None:
    url = f"{BASE}/undergraduate/general-education/gs/"
    assert catalog.classify_topic(["Waiver"], "Science & Technology", url) == "gened"


# Academic units


def test_units_from_unit_pages() -> None:
    by_key = {unit.key: unit for unit in units()}
    college = by_key["undergraduate/science-technology"]
    assert college.kind == "college"
    assert college.unit_code == "ST"
    assert college.level == "undergraduate"
    assert college.parent_key is None
    assert not college.professional_school


def test_program_group_nests_under_its_college_and_takes_its_code() -> None:
    group = {unit.key: unit for unit in units()}[
        "undergraduate/science-technology/accelerated-programs"
    ]
    assert group.kind == "program_group"
    assert group.parent_key == "undergraduate/science-technology"
    assert group.unit_code == "ST"


@pytest.mark.parametrize(
    ("key", "code"), [("graduate/scd/law", "LW"), ("graduate/scd/medicine", "ME")]
)
def test_professional_schools(key: str, code: str) -> None:
    unit = {unit.key: unit for unit in units()}[key]
    assert unit.professional_school
    assert unit.unit_code == code
    assert unit.kind == "school"


def test_unit_code_needs_exactly_one_chart_match() -> None:
    names = {"ST": "College of Science & Technology", "XX": "Science Hall"}
    assert catalog.match_unit_code("College of Science and Technology", names) == "ST"
    assert catalog.match_unit_code("Science", names) is None
    assert catalog.match_unit_code("Unknown School", names) is None


# Program facts


def test_bachelors_major() -> None:
    facts = describe("/undergraduate/science-technology/computer-science-bs/")
    assert facts.credential_type == "major"
    assert facts.degree_level == "bachelor"
    assert facts.award == "BS"
    assert facts.award_name == "Bachelor of Science"
    assert facts.program_codes == ["ST-CSCI-BS"]
    assert facts.campuses == ["Main", "Japan"]
    assert facts.level == "undergraduate"
    assert facts.unit_key == "undergraduate/science-technology"
    assert facts.unit_code == "ST"
    assert facts.accepting_applications is True
    assert facts.unresolved == []
    assert len(facts.listing_evidence) == 1


def test_first_professional_degree() -> None:
    facts = describe("/graduate/scd/law/law-jd/")
    assert facts.level == "professional"
    assert facts.degree_level == "first_professional"
    assert facts.award == "JD"
    assert facts.professional_school
    assert facts.unit_code == "LW"


def test_research_degree_in_a_professional_school_stays_graduate() -> None:
    facts = describe("/graduate/scd/medicine/biomedical-sciences-phd/")
    assert facts.level == "graduate"
    assert facts.degree_level == "doctorate"
    assert facts.professional_school


def test_chart_notes_and_prose_facts_are_kept() -> None:
    facts = describe("/graduate/scd/medicine/biomedical-sciences-ms/")
    assert facts.status_notes == ["thesis", "non-thesis"]
    assert len(facts.listing_evidence) == 2
    assert facts.unresolved == []
    # The campus fact is a sentence, so it isn't split at its comma.
    assert len(facts.campuses) == 1
    assert facts.campuses[0].startswith("Health Sciences Center. With")
    assert "Full-Time/Part-Time Status" in facts.formats


def test_accelerated_program_off_the_chart() -> None:
    facts = describe(
        "/undergraduate/science-technology/accelerated-programs/32-physician-assistant/"
    )
    assert facts.credential_type == "accelerated"
    assert facts.unit_key == "undergraduate/science-technology/accelerated-programs"
    assert facts.unit_code == "ST"
    assert facts.accepting_applications is None
    assert "not listed on the Academic Programs Chart" in facts.unresolved


def test_minor_without_a_unit_page_keeps_its_breadcrumb_unit() -> None:
    facts = describe("/undergraduate/fox-business-management/finance-minor/")
    assert facts.credential_type == "minor"
    assert facts.unit_key is None
    assert facts.unit_name == "Fox School of Business and Management"


@pytest.mark.parametrize(
    ("name", "expected"),
    [
        ("Bioengineering BSBIOE with Cellular Engineering Concentration", ["BSBioe"]),
        ("Nursing DNP (Post-Masters)", ["DNP"]),
        ("Education/Applied Linguistics PhD (TUJ)", ["PhD"]),
        ("Law JD/MBA", ["JD", "MBA"]),
        ("Finance Minor", []),
        ("Admissions Criteria", []),
    ],
)
def test_awards_in_name(name: str, expected: list[str]) -> None:
    lookup = catalog._award_lookup(index())
    assert catalog.awards_in_name(name, lookup) == expected


@pytest.mark.parametrize(
    ("award", "level"),
    [
        ("BS", "bachelor"),
        ("AA", "associate"),
        ("MS", "master"),
        ("LLM", "master"),
        ("PSM", "master"),
        ("EdS", "specialist"),
        ("PhD", "doctorate"),
        ("DMA", "doctorate"),
        ("SJD", "doctorate"),
        ("PharmD", "first_professional"),
        ("DPM", "first_professional"),
    ],
)
def test_degree_levels(award: str, level: str) -> None:
    assert catalog.degree_level(award) == level


def test_dual_and_concentration_credentials() -> None:
    assert (
        catalog._credential_type("Law JD/MBA", "", "professional", None, ["JD", "MBA"])
        == "dual"
    )
    assert (
        catalog._credential_type(
            "Classics BA with Classical Civilizations Concentration",
            "",
            "undergraduate",
            "BA",
            ["BA"],
        )
        == "concentration"
    )
    assert (
        catalog._credential_type(
            "Post-Master’s Graduate Certificate: Professional Studies",
            "",
            "graduate",
            "Cert.",
            [],
        )
        == "post_masters_certificate"
    )
    assert catalog._credential_type("ROTC", "", "undergraduate", None, []) is None


# Course designations


def test_gened_area_courses() -> None:
    records = catalog.course_designations(
        page("/undergraduate/general-education/ga/"), EDITION
    )
    area = [record for record in records if record.role == "area_course"]
    first = area[0]
    assert (first.designation, first.course) == ("GA", "ARTH 0808")
    assert first.title == "Art Matters: Ideas in Art and Architecture"
    assert first.list_path == ["Arts Courses"]
    assert first.evidence.text.endswith("ARTH 0808")


def test_cross_listed_area_course_shares_its_item() -> None:
    records = catalog.course_designations(
        page("/undergraduate/general-education/ga/"), EDITION
    )
    shared = [r for r in records if r.title == "Arts in Cultural Context"]
    assert [r.course for r in shared] == ["ASST 0871", "RUS 0871"]
    assert len({r.item_index for r in shared}) == 1


def test_waiver_lists_are_not_area_courses() -> None:
    records = catalog.course_designations(
        page("/undergraduate/general-education/gs/"), EDITION
    )
    waivers = [record for record in records if record.role == "waiver"]
    assert waivers
    assert all("Waiver" in record.list_path for record in waivers)
    assert all(record.title is None for record in waivers)
    assert "BIOL 1111" not in {
        record.course for record in records if record.role == "area_course"
    }


def test_only_gened_area_pages_give_designations() -> None:
    assert (
        catalog.course_designations(
            page("/undergraduate/academic-policies/repeating-course/"), EDITION
        )
        == []
    )
