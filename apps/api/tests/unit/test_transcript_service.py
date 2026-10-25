from __future__ import annotations

import pytest

from app.modules.transcript.schemas import TranscriptCourse
from app.modules.transcript.service import TranscriptService


@pytest.fixture()
def service() -> TranscriptService:
    return TranscriptService()


class TestCheckPrerequisites:
    def test_all_met(self, service):
        completed = [
            TranscriptCourse(
                subject="CIS",
                course_number="1068",
                title="X",
                grade="A",
                credits=4,
                term="Fall 2024",
            ),
            TranscriptCourse(
                subject="MATH",
                course_number="1041",
                title="X",
                grade="B",
                credits=4,
                term="Fall 2024",
            ),
        ]
        result = service.check_prerequisites(completed, ["CIS 1068", "MATH 1041"])
        assert all(result.values())

    def test_not_met(self, service):
        result = service.check_prerequisites([], ["CIS 2168"])
        assert result == {"CIS 2168": False}

    def test_failing_grade_not_counted(self, service):
        completed = [
            TranscriptCourse(
                subject="CIS",
                course_number="2168",
                title="X",
                grade="F",
                credits=4,
                term="Fall 2024",
            ),
        ]
        result = service.check_prerequisites(completed, ["CIS 2168"])
        assert result == {"CIS 2168": False}

    def test_withdrawal_not_counted(self, service):
        completed = [
            TranscriptCourse(
                subject="CIS",
                course_number="2168",
                title="X",
                grade="W",
                credits=4,
                term="Fall 2024",
            ),
        ]
        result = service.check_prerequisites(completed, ["CIS 2168"])
        assert result == {"CIS 2168": False}

    def test_d_minus_passes(self, service):
        completed = [
            TranscriptCourse(
                subject="CIS",
                course_number="2168",
                title="X",
                grade="D-",
                credits=4,
                term="Fall 2024",
            ),
        ]
        result = service.check_prerequisites(completed, ["CIS 2168"])
        assert result == {"CIS 2168": True}

    def test_pass_grade_counts(self, service):
        completed = [
            TranscriptCourse(
                subject="CIS",
                course_number="1068",
                title="X",
                grade="P",
                credits=4,
                term="Fall 2024",
            ),
        ]
        result = service.check_prerequisites(completed, ["CIS 1068"])
        assert result == {"CIS 1068": True}

    def test_mixed(self, service):
        completed = [
            TranscriptCourse(
                subject="CIS",
                course_number="1068",
                title="X",
                grade="A",
                credits=4,
                term="Fall 2024",
            ),
        ]
        result = service.check_prerequisites(completed, ["CIS 1068", "CIS 2168"])
        assert result == {"CIS 1068": True, "CIS 2168": False}
