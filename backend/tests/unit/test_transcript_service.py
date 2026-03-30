from __future__ import annotations

import pytest

from app.domains.transcript.schemas import TranscriptCourse
from app.domains.transcript.service import TranscriptService


@pytest.fixture()
def service() -> TranscriptService:
    return TranscriptService()


class TestParseTranscript:
    def test_parses_standard_lines(self, service, transcript_text):
        result = service.parse_transcript(transcript_text)
        assert len(result.courses) == 4
        assert result.gpa == 3.45

    def test_course_fields(self, service, transcript_text):
        result = service.parse_transcript(transcript_text)
        cis = next(c for c in result.courses if c.subject == "CIS")
        assert cis.course_number == "1068"
        assert cis.title == "Program Design and Abstraction"
        assert cis.grade == "A"
        assert cis.credits == 4.0
        assert cis.term == "Fall 2024"

    def test_empty_input(self, service):
        result = service.parse_transcript("")
        assert result.courses == []
        assert result.gpa is None

    def test_no_gpa_line(self, service):
        text = "CIS  1068 Program Design and Abstraction    A   4.00   Fall 2024\n"
        result = service.parse_transcript(text)
        assert len(result.courses) == 1
        assert result.gpa is None

    def test_various_grades(self, service):
        lines = [
            "CIS  1068 Course A    W    4.00   Fall 2024",
            "MATH 1041 Course B    P    3.00   Fall 2024",
            "ENGL 0802 Course C    B-   3.00   Spring 2025",
        ]
        result = service.parse_transcript("\n".join(lines))
        grades = [c.grade for c in result.courses]
        assert grades == ["W", "P", "B-"]

    def test_cumulative_gpa_variant(self, service):
        text = "CIS  1068 Some Course    A   4.00   Fall 2024\nCumulative GPA: 3.80\n"
        result = service.parse_transcript(text)
        assert result.gpa == 3.80


class TestCheckPrerequisites:
    def test_all_met(self, service):
        completed = [
            TranscriptCourse(subject="CIS", course_number="1068", title="X", grade="A", credits=4, term="Fall 2024"),
            TranscriptCourse(subject="MATH", course_number="1041", title="X", grade="B", credits=4, term="Fall 2024"),
        ]
        result = service.check_prerequisites(completed, ["CIS 1068", "MATH 1041"])
        assert all(result.values())

    def test_not_met(self, service):
        result = service.check_prerequisites([], ["CIS 2168"])
        assert result == {"CIS 2168": False}

    def test_failing_grade_not_counted(self, service):
        completed = [
            TranscriptCourse(subject="CIS", course_number="2168", title="X", grade="F", credits=4, term="Fall 2024"),
        ]
        result = service.check_prerequisites(completed, ["CIS 2168"])
        assert result == {"CIS 2168": False}

    def test_withdrawal_not_counted(self, service):
        completed = [
            TranscriptCourse(subject="CIS", course_number="2168", title="X", grade="W", credits=4, term="Fall 2024"),
        ]
        result = service.check_prerequisites(completed, ["CIS 2168"])
        assert result == {"CIS 2168": False}

    def test_d_minus_passes(self, service):
        completed = [
            TranscriptCourse(subject="CIS", course_number="2168", title="X", grade="D-", credits=4, term="Fall 2024"),
        ]
        result = service.check_prerequisites(completed, ["CIS 2168"])
        assert result == {"CIS 2168": True}

    def test_pass_grade_counts(self, service):
        completed = [
            TranscriptCourse(subject="CIS", course_number="1068", title="X", grade="P", credits=4, term="Fall 2024"),
        ]
        result = service.check_prerequisites(completed, ["CIS 1068"])
        assert result == {"CIS 1068": True}

    def test_mixed(self, service):
        completed = [
            TranscriptCourse(subject="CIS", course_number="1068", title="X", grade="A", credits=4, term="Fall 2024"),
        ]
        result = service.check_prerequisites(completed, ["CIS 1068", "CIS 2168"])
        assert result == {"CIS 1068": True, "CIS 2168": False}
