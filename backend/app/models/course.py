from __future__ import annotations

from pydantic import BaseModel


class Course(BaseModel):
    id: str
    subject: str
    course_number: str
    title: str
    credits: float
    description: str = ""


class Section(BaseModel):
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


class Professor(BaseModel):
    name: str
    department: str = ""
    rmp_id: str | None = None
