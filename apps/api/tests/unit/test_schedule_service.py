from __future__ import annotations

import pytest

from app.modules.schedule.schemas import SchedulePreferences, Section
from app.modules.schedule.service import (
    ScheduleService,
    _has_conflict,
    _parse_time,
    _score_schedule,
    _times_overlap,
)


def _meeting(
    crn: str,
    course_id: str,
    days: str,
    start: str,
    end: str,
    schedule_type: str = "",
) -> Section:
    return Section(
        crn=crn,
        course_id=course_id,
        instructor="X",
        days=days,
        start_time=start,
        end_time=end,
        schedule_type=schedule_type,
    )


class TestParseTime:
    def test_valid_time(self):
        t = _parse_time("09:30")
        assert t.hour == 9
        assert t.minute == 30

    def test_midnight(self):
        t = _parse_time("00:00")
        assert t.hour == 0

    def test_invalid_format(self):
        with pytest.raises(ValueError):
            _parse_time("9am")


class TestTimesOverlap:
    @staticmethod
    def _sec(days: str, start: str, end: str) -> Section:
        return Section(
            crn="X",
            course_id="X",
            instructor="X",
            days=days,
            start_time=start,
            end_time=end,
        )

    def test_no_overlap_different_days(self):
        a = self._sec("MWF", "09:00", "09:50")
        b = self._sec("TR", "09:00", "09:50")
        assert _times_overlap(a, b) is False

    def test_overlap_same_day(self):
        a = self._sec("MWF", "09:00", "09:50")
        b = self._sec("MWF", "09:30", "10:20")
        assert _times_overlap(a, b) is True

    def test_adjacent_no_overlap(self):
        a = self._sec("MWF", "09:00", "09:50")
        b = self._sec("MWF", "09:50", "10:40")
        assert _times_overlap(a, b) is False

    def test_contained(self):
        a = self._sec("T", "08:00", "11:00")
        b = self._sec("T", "09:00", "10:00")
        assert _times_overlap(a, b) is True


class TestHasConflict:
    @staticmethod
    def _sec(days: str, start: str, end: str) -> Section:
        return Section(
            crn="X",
            course_id="X",
            instructor="X",
            days=days,
            start_time=start,
            end_time=end,
        )

    def test_no_conflict(self):
        combo = (
            self._sec("MWF", "09:00", "09:50"),
            self._sec("MWF", "10:00", "10:50"),
        )
        assert _has_conflict(combo) is False

    def test_conflict(self):
        combo = (
            self._sec("MWF", "09:00", "09:50"),
            self._sec("MWF", "09:30", "10:20"),
        )
        assert _has_conflict(combo) is True

    def test_single_section(self):
        assert _has_conflict((self._sec("MWF", "09:00", "09:50"),)) is False


class TestScoreSchedule:
    @staticmethod
    def _sec(crn: str, days: str, start: str, end: str) -> Section:
        return Section(
            crn=crn,
            course_id="X",
            instructor="X",
            days=days,
            start_time=start,
            end_time=end,
        )

    def test_perfect_score(self):
        prefs = SchedulePreferences(earliest_time="09:00", latest_time="17:00")
        sections = [self._sec("A", "MWF", "10:00", "10:50")]
        score, warnings = _score_schedule(sections, prefs)
        assert score == 100.0
        assert warnings == []

    def test_early_penalty(self):
        prefs = SchedulePreferences(earliest_time="10:00", latest_time="17:00")
        sections = [self._sec("A", "MWF", "08:00", "08:50")]
        score, _ = _score_schedule(sections, prefs)
        assert score < 100.0

    def test_late_penalty(self):
        prefs = SchedulePreferences(earliest_time="08:00", latest_time="15:00")
        sections = [self._sec("A", "MWF", "16:00", "16:50")]
        score, _ = _score_schedule(sections, prefs)
        assert score < 100.0

    def test_non_preferred_day_penalty(self):
        prefs = SchedulePreferences(preferred_days=["M", "W", "F"])
        sections = [self._sec("A", "TR", "10:00", "11:15")]
        score, warnings = _score_schedule(sections, prefs)
        assert score < 100.0
        assert any("non-preferred" in w for w in warnings)

    def test_small_gap_warning(self):
        prefs = SchedulePreferences(min_gap_minutes=15)
        sections = [
            self._sec("A", "MWF", "09:00", "09:50"),
            self._sec("B", "MWF", "09:55", "10:45"),
        ]
        score, warnings = _score_schedule(sections, prefs)
        assert score < 100.0
        assert any("only" in w for w in warnings)

    def test_large_gap_warning(self):
        prefs = SchedulePreferences(max_gap_minutes=60)
        sections = [
            self._sec("A", "MWF", "08:00", "08:50"),
            self._sec("B", "MWF", "14:00", "14:50"),
        ]
        score, warnings = _score_schedule(sections, prefs)
        assert score < 100.0
        assert any("Large" in w for w in warnings)

    def test_score_never_negative(self):
        prefs = SchedulePreferences(earliest_time="18:00", latest_time="19:00")
        sections = [self._sec("A", "MWF", "08:00", "08:50")]
        score, _ = _score_schedule(sections, prefs)
        assert score >= 0.0


class TestScheduleService:
    def test_generates_non_conflicting_schedules(self, sample_sections, default_prefs):
        svc = ScheduleService()
        results = svc.generate_schedules(sample_sections, default_prefs)
        assert len(results) > 0
        for sched in results:
            assert not _has_conflict(tuple(sched.sections))

    def test_respects_max_results(self, sample_sections, default_prefs):
        svc = ScheduleService()
        results = svc.generate_schedules(sample_sections, default_prefs, max_results=2)
        assert len(results) <= 2

    def test_results_sorted_by_score(self, sample_sections, default_prefs):
        svc = ScheduleService()
        results = svc.generate_schedules(sample_sections, default_prefs)
        scores = [r.score for r in results]
        assert scores == sorted(scores, reverse=True)

    def test_one_section_per_course(self, sample_sections, default_prefs):
        svc = ScheduleService()
        results = svc.generate_schedules(sample_sections, default_prefs)
        for sched in results:
            crns_by_course: dict[str, set[str]] = {}
            for s in sched.sections:
                crns_by_course.setdefault(s.course_id, set()).add(s.crn)
            assert all(len(crns) == 1 for crns in crns_by_course.values())

    def test_keeps_every_meeting_of_a_section(self, default_prefs):
        """A CRN with two meeting blocks is one choice, never two alternatives."""
        svc = ScheduleService()
        two_block_section = [
            _meeting("7273", "CIS2168", "M", "09:00", "10:50"),
            _meeting("7273", "CIS2168", "W", "11:00", "12:20"),
        ]
        results = svc.generate_schedules(two_block_section, default_prefs)
        assert len(results) == 1
        assert results[0].sections == two_block_section

    def test_picks_each_meeting_set_together(self, default_prefs):
        svc = ScheduleService()
        sections = [
            _meeting("1", "CIS2168", "M", "09:00", "10:50"),
            _meeting("1", "CIS2168", "W", "11:00", "12:20"),
            _meeting("2", "CIS2168", "T", "09:00", "10:50"),
            _meeting("2", "CIS2168", "R", "11:00", "12:20"),
        ]
        results = svc.generate_schedules(sections, default_prefs)
        assert len(results) == 2
        for sched in results:
            assert len(sched.sections) == 2
            assert len({s.crn for s in sched.sections}) == 1

    def test_schedules_lecture_and_lab_together(self, default_prefs):
        """A lab with its own CRN is a separate component, not a lecture alternative."""
        svc = ScheduleService()
        sections = [
            _meeting("41311", "CIS2107", "MWF", "10:00", "10:50", "Lecture"),
            _meeting("41315", "CIS2107", "W", "13:00", "14:50", "Laboratory"),
            _meeting("41317", "CIS2107", "F", "12:00", "13:50", "Laboratory"),
        ]
        results = svc.generate_schedules(sections, default_prefs)
        assert len(results) == 2
        for sched in results:
            types = sorted(s.schedule_type for s in sched.sections)
            assert types == ["Laboratory", "Lecture"]

    def test_meetings_of_the_same_section_never_conflict(self, default_prefs):
        svc = ScheduleService()
        overlapping_blocks = [
            _meeting("5", "CIS1001", "T", "09:00", "10:00"),
            _meeting("5", "CIS1001", "T", "09:30", "10:30"),
        ]
        results = svc.generate_schedules(overlapping_blocks, default_prefs)
        assert len(results) == 1

    def test_all_conflicting_returns_empty(self, conflicting_sections, default_prefs):
        svc = ScheduleService()
        results = svc.generate_schedules(conflicting_sections, default_prefs)
        assert results == []

    def test_empty_input(self, default_prefs):
        svc = ScheduleService()
        assert svc.generate_schedules([], default_prefs) == []

    def test_single_course_single_section(self, default_prefs):
        svc = ScheduleService()
        sec = Section(
            crn="99",
            course_id="CIS9999",
            instructor="Solo",
            days="MWF",
            start_time="12:00",
            end_time="12:50",
        )
        results = svc.generate_schedules([sec], default_prefs)
        assert len(results) == 1
        assert results[0].sections == [sec]
