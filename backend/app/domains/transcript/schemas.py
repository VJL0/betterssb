from __future__ import annotations

from app.shared.schemas.base import BaseSchema


class TranscriptCourse(BaseSchema):
    subject: str
    course_number: str
    title: str
    grade: str
    credits: float
    term: str


class TranscriptData(BaseSchema):
    courses: list[TranscriptCourse]
    gpa: float | None = None


class DegreeRequirement(BaseSchema):
    name: str
    required_courses: list[str]
    completed_courses: list[str]
    remaining_courses: list[str]


class PrereqCheckRequest(BaseSchema):
    completed: list[TranscriptCourse]
    required: list[str]
