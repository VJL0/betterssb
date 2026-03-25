from __future__ import annotations

import pytest

from app.models.course import Section
from app.models.schedule import SchedulePreferences
from app.services.schedule_service import (
    ScheduleService,
    _has_conflict,
    _parse_time,
    _score_schedule,
    _times_overlap,
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
        return Section(crn="X", course_id="X", instructor="X", days=days, start_time=start, end_time=end)

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
        return Section(crn="X", course_id="X", instructor="X", days=days, start_time=start, end_time=end)

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
        return Section(crn=crn, course_id="X", instructor="X", days=days, start_time=start, end_time=end)

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
            course_ids = [s.course_id for s in sched.sections]
            assert len(course_ids) == len(set(course_ids))

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
            crn="99", course_id="CIS9999", instructor="Solo", days="MWF", start_time="12:00", end_time="12:50"
        )
        results = svc.generate_schedules([sec], default_prefs)
        assert len(results) == 1
        assert results[0].sections == [sec]
