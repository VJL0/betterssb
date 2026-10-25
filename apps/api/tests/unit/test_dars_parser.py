from __future__ import annotations

import pytest

from app.modules.dars.parser import parse_audit
from app.modules.dars.schemas import Audit, HoursSummary, Progress


@pytest.fixture()
def audit(dars_audit_html) -> Audit:
    return parse_audit(dars_audit_html)


def _req(audit: Audit, code: str):
    return next(r for r in audit.requirements if r.code == code)


def _sub(audit: Audit, code: str, number: str):
    return next(s for s in _req(audit, code).subrequirements if s.number == number)


class TestAuditHeader:
    def test_header_fields(self, audit):
        assert audit.student_name == "Doe, Jane"
        assert audit.program_title == "COMPUTER SCIENCE - B.S."
        assert audit.program_code == "ST-CSCI-BS"
        assert audit.catalog_year == "Fall 2024"
        assert audit.prepared_on == "10/02/2026 05:14 PM"
        assert audit.graduation_date == "05/2028"

    def test_leaves_out_the_student_id(self, audit):
        assert "000000000" not in audit.model_dump_json()

    def test_overall_completion(self, audit):
        assert audit.complete is False

    def test_end_of_analysis_marker(self, audit):
        assert audit.analysis_complete is True
        assert parse_audit("<html><body></body></html>").analysis_complete is False


class TestChartTotals:
    def test_degree_totals(self, audit):
        assert audit.degree_totals == HoursSummary(
            completed_credits=69.0,
            in_progress_credits=18.0,
            unfulfilled_credits=36.0,
            planned_credits=0.0,
            gpa=3.4391668,
            required_gpa=2.0,
        )

    def test_category_totals_leave_out_unreported_gpas(self, audit):
        gened, major = audit.category_totals
        assert gened.category == "GENED"
        assert (gened.completed_credits, gened.in_progress_credits) == (27.0, 4.0)
        assert (gened.gpa, gened.required_gpa) == (None, None)
        assert (major.category, major.required_gpa) == ("MAJOR", 2.0)

    def test_printer_friendly_page_has_no_chart(self):
        audit = parse_audit("<html><body></body></html>")
        assert audit.degree_totals is None
        assert audit.category_totals == []

    def test_requirements_in_page_order(self, audit):
        assert [r.code for r in audit.requirements] == [
            "WARNING",
            "GENED-GW",
            "GENED-GB",
            "CISS.TBS",
            "CAS-ULS",
            "FREECSBS",
            "TRANSCRIP",
        ]


class TestRequirements:
    def test_informational_section_keeps_notes_without_rules(self, audit):
        warning = _req(audit, "WARNING")
        assert warning.status == "none"
        assert warning.title == ""
        assert warning.notes == [
            "W A R N I N G",
            (
                "THE DARS ANALYSIS IS NOT DEFINITIVE. FINAL RESPONSIBILITY FOR "
                "COMPLETION OF REQUIREMENTS IS HELD BY YOU."
            ),
        ]

    def test_short_lines_are_separate_notes(self, audit):
        assert _req(audit, "GENED-GW").notes == [
            "TEMPLE UNIVERSITY",
            "FULL GENERAL EDUCATION",
            (
                "A STUDENT MAY USE NO MORE THAN TWO COURSES FROM A SINGLE DEPT. "
                "TO SATISFY GENED REQUIREMENTS."
            ),
        ]

    def test_title_drops_code_prefix(self, audit):
        assert (
            _req(audit, "GENED-GW").title
            == "GENED REQUIREMENT FOR ANALYTIC READ AND WRITING"
        )
        assert (
            _req(audit, "CISS.TBS").title
            == "COMPUTER SCIENCE MAJOR REQUIREMENTS - B.S."
        )

    def test_wrapped_title_joins_its_lines(self, audit):
        assert _req(audit, "CAS-ULS").title == (
            "A MINIMUM OF 45 SEMESTER HOURS IN UPPER LEVEL COURSES "
            "MUST BE COMPLETED WITH A PASSING GRADE"
        )

    def test_starred_lines_under_a_title_are_notes(self, audit):
        electives = _req(audit, "FREECSBS")
        assert electives.title == "FREE ELECTIVES REQUIREMENT"
        assert electives.notes == [
            "COURSES NOT USED TO SATISFY GENED, COLLEGE OR MAJOR, ETC",
            (
                "PLEASE SEE AN ADVISOR FOR A CONFIRMATION ON WHAT "
                "COURSES ARE CLASSIFIED AS 'FREE ELECTIVES'."
            ),
        ]
        history = _req(audit, "TRANSCRIP")
        assert history.title == "COURSE HISTORY SP2023 to FL2026"
        assert history.notes == ["This is not an official transcript of your grades"]

    def test_status_and_category(self, audit):
        gw = _req(audit, "GENED-GW")
        assert (gw.status, gw.category) == ("complete", "GENED")
        uls = _req(audit, "CAS-ULS")
        assert (uls.status, uls.category) == ("incomplete", "")

    def test_requirement_totals(self, audit):
        uls = _req(audit, "CAS-ULS")
        assert uls.earned == Progress(credits=26.0, gpa=3.44)
        assert uls.in_progress == Progress(credits=14.0)
        assert uls.needs == Progress(credits=5.0)

    def test_sub_requirement_counts(self, audit):
        assert _req(audit, "FREECSBS").needs == Progress(
            credits=22.0, subrequirements=1
        )

    def test_requirement_rules(self, audit):
        major = _req(audit, "CISS.TBS")
        assert major.required_subrequirements == 16
        assert major.required_gpa == 2.0
        assert major.required_credits is None
        assert major.max_credits is None
        upper = _req(audit, "CAS-ULS")
        assert upper.required_credits == 45.0
        assert upper.max_credits is None
        gened = _req(audit, "GENED-GB")
        assert (gened.required_count, gened.max_credits) == (1, 3.0)

    def test_no_totals_when_table_empty(self, audit):
        gw = _req(audit, "GENED-GW")
        assert gw.earned is None and gw.needs is None


class TestSubRequirements:
    def test_untitled_subrequirement_inherits_status(self, audit):
        (sub,) = _req(audit, "GENED-GW").subrequirements
        assert sub.status == "complete"
        assert sub.title == ""

    def test_taken_course(self, audit):
        (sub,) = _req(audit, "GENED-GW").subrequirements
        (course,) = sub.courses
        assert course.term == "SP25"
        assert course.course == "ENG 0802"
        assert course.title == "Analytical Reading & Writing"
        assert course.credits == 4.0
        assert course.grade == "B+"
        assert course.in_progress is False
        assert (course.transfer, course.exception) == (False, False)

    def test_in_progress_course(self, audit):
        ip_sub = _sub(audit, "CISS.TBS", "11")
        assert ip_sub.status == "in_progress"
        assert ip_sub.title == "SOFTWARE DESIGN"
        assert ip_sub.courses[0].in_progress is True

    def test_unmet_subrequirement_needs_and_options(self, audit):
        unmet = _sub(audit, "CISS.TBS", "12")
        assert unmet.status == "incomplete"
        assert unmet.title == "COMPUTER SCIENCE"
        assert unmet.notes == ["NOTE: WRITING INTENSIVE"]
        assert unmet.needs == Progress(courses=1)
        assert unmet.courses == []
        assert unmet.select_from == ["CIS 4397", "CIS 4398"]

    def test_notes_split_from_title_and_join_wrapped_lines(self, audit):
        electives = _sub(audit, "CISS.TBS", "13")
        assert electives.title == "FOUR TO FIVE CIS ELECTIVES"
        assert electives.notes == [
            "15-16 CREDITS ARE REQUIRED",
            (
                "A MAXIMUM OF EIGHT CREDITS FROM CIS 3381, 4282 OR "
                "4382 MAY BE TAKEN AS ELECTIVES."
            ),
            "A MAXIMUM OF FOUR CREDITS FROM CIS 3381 MAY BE TAKEN AS ELECTIVES.",
        ]

    def test_credit_progress_and_requirement(self, audit):
        electives = _sub(audit, "CISS.TBS", "13")
        assert electives.earned == Progress(credits=4.0)
        assert electives.in_progress == Progress(credits=3.0)
        assert electives.needs == Progress(credits=8.0)
        assert electives.required_credits == 15.0
        assert _sub(audit, "CISS.TBS", "14").required_credits is None

    def test_wrapped_title_runs_to_its_dash(self, audit):
        lab = _sub(audit, "CISS.TBS", "16")
        assert lab.title == "TWO SEQUENCED LAB SCIENCE COURSES TAKEN IN ONE DEPARTMENT"
        assert lab.notes == []

    def test_sets_are_counted_apart_from_courses(self, audit):
        lab = _sub(audit, "CISS.TBS", "16")
        assert lab.earned == Progress(sets=0)
        assert lab.in_progress == Progress(sets=1)

    def test_exception_is_not_a_course(self, audit):
        (exception,) = _sub(audit, "CISS.TBS", "14").courses
        assert exception.course == "CISS.TBS-14"
        assert exception.grade == "CP"
        assert exception.exception is True
        assert exception.term == ""

    def test_transfer_credit_keeps_its_source(self, audit):
        (sub,) = _req(audit, "TRANSCRIP").subrequirements
        (course,) = sub.courses
        assert course.title == "Program Design & Abstraction"
        assert course.notes == ["T01008: AP314"]
        assert course.transfer is True

    def test_condition_code(self, audit):
        course = _sub(audit, "FREECSBS", "1").courses[0]
        assert course.condition_code == ">D"
        assert course.transfer is True

    def test_parenthesized_credits(self, audit):
        (sub,) = _req(audit, "TRANSCRIP").subrequirements
        assert sub.title == "SP2024"
        assert sub.earned == Progress(credits=4.0)

    def test_subrequirement_codes_and_rules(self, audit):
        gb = _sub(audit, "GENED-GB", "1")
        assert gb.code == "GENED-GB-1"
        assert gb.aliases == ["GENEDGB1", "GB-1", "MINORGENED"]
        assert (gb.required_count, gb.max_credits) == (1, 3.0)
        assert _sub(audit, "CISS.TBS", "14").max_credits == 4.5
        assert _sub(audit, "CISS.TBS", "13").max_credits is None

    def test_informational_sections_have_no_rules(self, audit):
        history = _req(audit, "TRANSCRIP")
        assert history.required_subrequirements is None
        assert history.subrequirements[0].max_credits is None

    def test_required_marker(self, audit):
        assert _sub(audit, "CAS-ULS", "1").required is True
        assert _sub(audit, "GENED-GB", "1").required is False

    def test_cross_listed_courses_form_one_choice(self, audit):
        gb = _sub(audit, "GENED-GB", "1")
        assert [[c.course for c in choice.courses] for choice in gb.choices] == [
            ["ANTH 0814", "GUS 0814"],
            ["AOD 0836", "CSI 0836"],
            ["EDUC 0823"],
            ["EDUC 0815"],
        ]
        assert gb.select_from == [
            "ANTH 0814",
            "GUS 0814",
            "AOD 0836",
            "CSI 0836",
            "EDUC 0823",
            "EDUC 0815",
        ]

    def test_choice_term_windows(self, audit):
        gb = _sub(audit, "GENED-GB", "1")
        aod, csi = gb.choices[1].courses
        assert (aod.taken, csi.taken) == ("", "SP19 OR AFTER")
        assert gb.choices[2].courses[0].taken == "SP10-S216"

    def test_choice_credit_cap(self, audit):
        electives = _sub(audit, "CISS.TBS", "13")
        (cis3100,), (cis3381,) = (c.courses for c in electives.choices)
        assert (cis3100.course, cis3100.max_credits) == ("CIS 3100", None)
        assert (cis3381.course, cis3381.max_credits) == ("CIS 3381", 4.0)

    def test_excluded_courses(self, audit):
        assert _sub(audit, "CISS.TBS", "13").not_from == ["CIS 4398"]
        assert _sub(audit, "GENED-GB", "1").not_from == []

    def test_banner_terms(self, audit):
        free = _sub(audit, "FREECSBS", "1")
        assert [(c.term, c.banner_term) for c in free.courses] == [
            ("SP23", "202303"),
            ("S224", "202426"),
        ]
        assert _sub(audit, "CISS.TBS", "11").courses[0].banner_term == "202636"
        assert _sub(audit, "CISS.TBS", "14").courses[0].banner_term == ""

    def test_equivalent_course(self, audit):
        edad = _sub(audit, "FREECSBS", "1").courses[1]
        assert edad.satisfies == "AMST 0855"
        assert edad.notes == ["Satisfies: AMST 0855"]

    def test_transfer_source(self, audit):
        (sub,) = _req(audit, "TRANSCRIP").subrequirements
        (course,) = sub.courses
        assert (course.transfer_institution, course.transfer_course) == (
            "T01008",
            "AP314",
        )
        assert _sub(audit, "CISS.TBS", "11").courses[0].transfer_institution == ""

    def test_course_ranges_collapse_to_one_option(self, audit):
        (sub,) = _req(audit, "CAS-ULS").subrequirements
        assert sub.select_from == ["CST 2000-4999", "ENGR 2000-4999"]
        assert [[c.course for c in choice.courses] for choice in sub.choices] == [
            ["CST 2000-4999"],
            ["ENGR 2000-4999"],
        ]


class TestEdgeCases:
    def test_empty_page(self):
        audit = parse_audit("<html><body></body></html>")
        assert audit.requirements == []
        assert audit.complete is None
        assert audit.student_name == ""

    def test_serializes_camel_case(self, audit):
        data = audit.model_dump(by_alias=True)
        assert "programTitle" in data
        assert "selectFrom" in data["requirements"][3]["subrequirements"][1]
        assert "requiredCredits" in data["requirements"][3]["subrequirements"][2]
