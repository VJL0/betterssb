from __future__ import annotations

import pytest

from app.domains.dars.parser import parse_audit
from app.domains.dars.schemas import Audit, Progress


@pytest.fixture()
def audit(dars_audit_html) -> Audit:
    return parse_audit(dars_audit_html)


def _req(audit: Audit, code: str):
    return next(r for r in audit.requirements if r.code == code)


class TestAuditHeader:
    def test_header_fields(self, audit):
        assert audit.student_name == "Doe, Jane"
        assert audit.program_title == "COMPUTER SCIENCE - B.S."
        assert audit.program_code == "ST-CSCI-BS"
        assert audit.catalog_year == "Fall 2024"
        assert audit.prepared_on == "10/02/2026 05:14 PM"

    def test_overall_completion(self, audit):
        assert audit.complete is False

    def test_requirements_in_page_order(self, audit):
        assert [r.code for r in audit.requirements] == ["WARNING", "GENED-GW", "CISS.TBS", "CAS-ULS"]


class TestRequirements:
    def test_informational_section_keeps_notes_without_rules(self, audit):
        warning = _req(audit, "WARNING")
        assert warning.status == "none"
        assert warning.title == ""
        assert warning.notes == ["W A R N I N G", "THE DARS ANALYSIS IS NOT DEFINITIVE."]

    def test_title_drops_code_prefix(self, audit):
        assert _req(audit, "GENED-GW").title == "GENED REQUIREMENT FOR ANALYTIC READ AND WRITING"
        assert _req(audit, "CISS.TBS").title == "COMPUTER SCIENCE MAJOR REQUIREMENTS - B.S."

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

    def test_in_progress_course(self, audit):
        ip_sub, _ = _req(audit, "CISS.TBS").subrequirements
        assert ip_sub.number == "11"
        assert ip_sub.status == "in_progress"
        assert ip_sub.title == "SOFTWARE DESIGN"
        assert ip_sub.courses[0].in_progress is True

    def test_unmet_subrequirement_needs_and_options(self, audit):
        _, unmet = _req(audit, "CISS.TBS").subrequirements
        assert unmet.status == "incomplete"
        assert unmet.title == "COMPUTER SCIENCE - NOTE: WRITING INTENSIVE"
        assert unmet.needs == Progress(courses=1)
        assert unmet.courses == []
        assert unmet.select_from == ["CIS 4397", "CIS 4398"]

    def test_course_ranges_collapse_to_one_option(self, audit):
        (sub,) = _req(audit, "CAS-ULS").subrequirements
        assert sub.select_from == ["CST 2000-4999", "ENGR 2000-4999"]


class TestEdgeCases:
    def test_empty_page(self):
        audit = parse_audit("<html><body></body></html>")
        assert audit.requirements == []
        assert audit.complete is None
        assert audit.student_name == ""

    def test_serializes_camel_case(self, audit):
        data = audit.model_dump(by_alias=True)
        assert "programTitle" in data
        assert "selectFrom" in data["requirements"][2]["subrequirements"][1]
