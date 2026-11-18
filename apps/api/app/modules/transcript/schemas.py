from __future__ import annotations

from app.shared.schemas import BaseSchema


class TranscriptCourse(BaseSchema):
    subject: str
    course_number: str
    title: str
    grade: str
    credits: float
    term: str
