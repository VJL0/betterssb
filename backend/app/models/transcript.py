from __future__ import annotations

from pydantic import BaseModel


class TranscriptCourse(BaseModel):
    subject: str
    course_number: str
    title: str
    grade: str
    credits: float
    term: str


class TranscriptData(BaseModel):
    courses: list[TranscriptCourse]
    gpa: float | None = None


class DegreeRequirement(BaseModel):
    name: str
    required_courses: list[str]
    completed_courses: list[str]
    remaining_courses: list[str]
