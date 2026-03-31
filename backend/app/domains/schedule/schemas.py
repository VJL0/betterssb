from __future__ import annotations

from app.shared.schemas.base import BaseSchema


class Course(BaseSchema):
    id: str
    subject: str
    course_number: str
    title: str
    credits: float
    description: str = ""


class Section(BaseSchema):
    crn: str
    course_id: str
    instructor: str
    days: str
    start_time: str
    end_time: str
    location: str = ""
    seats_available: int = 0
    max_seats: int = 0
    term: str = ""


class Professor(BaseSchema):
    name: str
    department: str = ""
    rmp_id: str | None = None


class SchedulePreferences(BaseSchema):
    preferred_days: list[str] | None = None
    earliest_time: str | None = "08:00"
    latest_time: str | None = "22:00"
    max_gap_minutes: int | None = 120
    min_gap_minutes: int | None = 10


class GeneratedSchedule(BaseSchema):
    sections: list[Section]
    score: float
    warnings: list[str] = []


class GenerateRequest(BaseSchema):
    sections: list[Section]
    preferences: SchedulePreferences = SchedulePreferences()
    max_results: int = 5
