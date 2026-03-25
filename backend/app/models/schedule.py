from __future__ import annotations

from pydantic import BaseModel

from app.models.course import Section


class SchedulePreferences(BaseModel):
    preferred_days: list[str] | None = None
    earliest_time: str | None = "08:00"
    latest_time: str | None = "22:00"
    max_gap_minutes: int | None = 120
    min_gap_minutes: int | None = 10


class GeneratedSchedule(BaseModel):
    sections: list[Section]
    score: float
    warnings: list[str] = []
