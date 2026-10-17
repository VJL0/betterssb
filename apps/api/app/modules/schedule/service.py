from __future__ import annotations

import itertools
from datetime import datetime

from app.modules.schedule.schemas import GeneratedSchedule, SchedulePreferences, Section


def _parse_time(t: str) -> datetime:
    return datetime.strptime(t, "%H:%M")


def _times_overlap(a: Section, b: Section) -> bool:
    """Return True if two sections share any day and their time ranges overlap."""
    days_a = set(a.days.upper())
    days_b = set(b.days.upper())
    if not days_a & days_b:
        return False

    a_start, a_end = _parse_time(a.start_time), _parse_time(a.end_time)
    b_start, b_end = _parse_time(b.start_time), _parse_time(b.end_time)
    return a_start < b_end and b_start < a_end


def _has_conflict(combo: tuple[Section, ...]) -> bool:
    for i, a in enumerate(combo):
        for b in combo[i + 1 :]:
            if _times_overlap(a, b):
                return True
    return False


def _group_choices(sections: list[Section]) -> list[list[list[Section]]]:
    """Group meeting blocks into the choices a schedule makes.

    Each course component (course + schedule type, so a lab is separate from
    its lecture) is one group, and each CRN in it is one choice holding all of
    that section's meeting blocks.
    """
    components: dict[tuple[str, str], dict[str, list[Section]]] = {}
    for sec in sections:
        by_crn = components.setdefault((sec.course_id, sec.schedule_type), {})
        by_crn.setdefault(sec.crn, []).append(sec)
    return [list(by_crn.values()) for by_crn in components.values()]


def _choices_conflict(choices: tuple[list[Section], ...]) -> bool:
    """True if meetings of two different chosen sections overlap."""
    for i, a in enumerate(choices):
        for b in choices[i + 1 :]:
            if any(_times_overlap(x, y) for x in a for y in b):
                return True
    return False


def _sections_on_day(sections: list[Section], day: str) -> list[Section]:
    return sorted(
        [s for s in sections if day.upper() in s.days.upper()],
        key=lambda s: _parse_time(s.start_time),
    )


def _score_schedule(
    sections: list[Section], prefs: SchedulePreferences
) -> tuple[float, list[str]]:
    """Score a schedule from 0-100 based on how well it matches preferences."""
    score = 100.0
    warnings: list[str] = []

    earliest = _parse_time(prefs.earliest_time or "08:00")
    latest = _parse_time(prefs.latest_time or "22:00")
    max_gap = prefs.max_gap_minutes or 120
    min_gap = prefs.min_gap_minutes or 10

    for section in sections:
        s_start = _parse_time(section.start_time)
        s_end = _parse_time(section.end_time)

        if s_start < earliest:
            penalty = (earliest - s_start).total_seconds() / 60
            score -= penalty * 0.5
            warnings.append(f"{section.crn} starts before preferred earliest time")

        if s_end > latest:
            penalty = (s_end - latest).total_seconds() / 60
            score -= penalty * 0.5
            warnings.append(f"{section.crn} ends after preferred latest time")

    if prefs.preferred_days:
        pref_days = {d.upper() for d in prefs.preferred_days}
        for section in sections:
            section_days = set(section.days.upper())
            off_days = section_days - pref_days
            if off_days:
                score -= len(off_days) * 5
                warnings.append(f"{section.crn} meets on non-preferred day(s)")

    all_days = set()
    for s in sections:
        all_days.update(s.days.upper())

    for day in all_days:
        day_sections = _sections_on_day(sections, day)
        for i in range(len(day_sections) - 1):
            # Gaps inside one section (lecture then its lab block) aren't the student's choice.
            if day_sections[i].crn == day_sections[i + 1].crn:
                continue
            end_curr = _parse_time(day_sections[i].end_time)
            start_next = _parse_time(day_sections[i + 1].start_time)
            gap_min = (start_next - end_curr).total_seconds() / 60

            if gap_min < min_gap:
                score -= 10
                warnings.append(
                    f"Gap between {day_sections[i].crn} and {day_sections[i + 1].crn} is only {int(gap_min)} min"
                )
            elif gap_min > max_gap:
                score -= (gap_min - max_gap) * 0.1
                warnings.append(
                    f"Large {int(gap_min)} min gap between {day_sections[i].crn} and {day_sections[i + 1].crn}"
                )

    # A section with several meeting blocks can trip the same warning more than once.
    return max(score, 0.0), list(dict.fromkeys(warnings))


class ScheduleService:
    """Constraint-based schedule generator using brute-force combination search."""

    def generate_schedules(
        self,
        sections: list[Section],
        preferences: SchedulePreferences,
        max_results: int = 5,
    ) -> list[GeneratedSchedule]:
        """Generate non-conflicting schedules ranked by preference score.

        Tries every combination that picks exactly one section per course
        component (see `_group_choices`), discarding those with time conflicts.
        """
        groups = _group_choices(sections)
        if not groups:
            return []

        results: list[GeneratedSchedule] = []

        for combo in itertools.product(*groups):
            if _choices_conflict(combo):
                continue

            meetings = [meeting for choice in combo for meeting in choice]
            score, warnings = _score_schedule(meetings, preferences)
            results.append(
                GeneratedSchedule(
                    sections=meetings,
                    score=round(score, 2),
                    warnings=warnings,
                )
            )

        results.sort(key=lambda s: s.score, reverse=True)
        return results[:max_results]
