from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.domains.degree.schemas import (
    CourseOption,
    CourseRef,
    DegreeProgram,
    LabScienceSequence,
    PlanSemester,
    PlanYear,
    RequirementGroup,
    RequirementItem,
    SelectionType,
    SuggestedPlan,
)
from app.domains.rmp.schemas import RMPRating
from app.domains.schedule.schemas import Course, GeneratedSchedule, Professor, SchedulePreferences, Section
from app.domains.transcript.schemas import DegreeRequirement, TranscriptCourse, TranscriptData


class TestCourseModels:
    def test_course_creation(self):
        c = Course(id="CIS1068", subject="CIS", course_number="1068", title="Program Design", credits=4.0)
        assert c.subject == "CIS"
        assert c.credits == 4.0
        assert c.description == ""

    def test_section_defaults(self):
        s = Section(
            crn="10001", course_id="CIS1068", instructor="Smith", days="MWF", start_time="09:00", end_time="09:50"
        )
        assert s.seats_available == 0
        assert s.location == ""
        assert s.term == ""

    def test_professor_optional_rmp_id(self):
        p = Professor(name="John Smith")
        assert p.rmp_id is None
        p2 = Professor(name="Jane Doe", rmp_id="abc123")
        assert p2.rmp_id == "abc123"


class TestRMPRating:
    def test_rating_with_defaults(self):
        r = RMPRating(professor_name="Test Prof", overall_rating=4.5, difficulty=2.0, num_ratings=50)
        assert r.would_take_again_pct is None
        assert r.top_tags == []
        assert r.rmp_url == ""

    def test_rating_full(self):
        r = RMPRating(
            professor_name="Jane Doe",
            department="CIS",
            overall_rating=4.8,
            would_take_again_pct=95.0,
            difficulty=3.0,
            num_ratings=120,
            top_tags=["Amazing lectures", "Tough grader"],
            rmp_url="https://ratemyprofessors.com/professor/123",
        )
        assert len(r.top_tags) == 2
        assert r.department == "CIS"


class TestScheduleModels:
    def test_preferences_defaults(self):
        p = SchedulePreferences()
        assert p.earliest_time == "08:00"
        assert p.latest_time == "22:00"
        assert p.max_gap_minutes == 120
        assert p.min_gap_minutes == 10
        assert p.preferred_days is None

    def test_generated_schedule(self):
        sec = Section(
            crn="10001", course_id="CIS1068", instructor="X", days="MWF", start_time="09:00", end_time="09:50"
        )
        gs = GeneratedSchedule(sections=[sec], score=95.0)
        assert len(gs.sections) == 1
        assert gs.warnings == []


class TestTranscriptModels:
    def test_transcript_course_required_fields(self):
        tc = TranscriptCourse(
            subject="CIS",
            course_number="1068",
            title="Program Design",
            grade="A",
            credits=4.0,
            term="Fall 2024",
        )
        assert tc.grade == "A"

    def test_transcript_data_optional_gpa(self):
        td = TranscriptData(courses=[])
        assert td.gpa is None

    def test_degree_requirement(self):
        dr = DegreeRequirement(
            name="Core CS",
            required_courses=["CIS 1068", "CIS 2168"],
            completed_courses=["CIS 1068"],
            remaining_courses=["CIS 2168"],
        )
        assert len(dr.remaining_courses) == 1


class TestDegreeModels:
    def test_selection_type_enum(self):
        assert SelectionType.REQUIRED.value == "required"
        assert SelectionType.SELECT_ONE.value == "select_one"
        assert SelectionType.SELECT_N.value == "select_n"

    def test_course_ref_defaults(self):
        ref = CourseRef(subject="CIS", number="1068", title="Program Design")
        assert ref.credits is None
        assert ref.writing_intensive is False
        assert ref.bulletin_url == ""

    def test_required_item(self):
        ref = CourseRef(subject="CIS", number="2168", title="Data Structures")
        opt = CourseOption(courses=[ref])
        item = RequirementItem(
            selection_type=SelectionType.REQUIRED,
            credits=4.0,
            options=[opt],
        )
        assert item.selection_type == SelectionType.REQUIRED
        assert len(item.options) == 1

    def test_select_one_item(self):
        item = RequirementItem(
            selection_type=SelectionType.SELECT_ONE,
            description="Select one introductory course",
            options=[
                CourseOption(courses=[CourseRef(subject="CIS", number="1051", title="Intro to IT")]),
                CourseOption(courses=[CourseRef(subject="CIS", number="1057", title="Intro C++")]),
            ],
        )
        assert len(item.options) == 2

    def test_requirement_group(self):
        g = RequirementGroup(name="CS Core", items=[])
        assert g.constraints == []

    def test_degree_program_empty(self):
        dp = DegreeProgram(name="Test Program")
        assert dp.categories == []
        assert dp.lab_science_sequences == []
        assert dp.suggested_plan is None

    def test_lab_science_sequence(self):
        seq = LabScienceSequence(
            department="Biology",
            science_a_options=[CourseOption(courses=[CourseRef(subject="BIOL", number="1011", title="Bio I")])],
        )
        assert seq.science_a_label == "Lab Science A"
        assert len(seq.science_a_options) == 1

    def test_suggested_plan(self):
        sem = PlanSemester(term="Fall", courses=[], total_credits="15")
        year = PlanYear(year=1, semesters=[sem])
        plan = SuggestedPlan(years=[year], total_credits="120")
        assert plan.years[0].semesters[0].term == "Fall"

    def test_course_ref_missing_required_field(self):
        with pytest.raises(ValidationError):
            CourseRef(subject="CIS", number="1068")  # type: ignore[call-arg]
