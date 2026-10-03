from __future__ import annotations

from typing import Literal

from app.shared.schemas.base import BaseSchema

AuditStatus = Literal["complete", "incomplete", "in_progress", "none"]


class Progress(BaseSchema):
    credits: float | None = None
    courses: int | None = None
    gpa: float | None = None


class AuditCourse(BaseSchema):
    term: str
    course: str
    title: str = ""
    credits: float | None = None
    grade: str = ""
    in_progress: bool = False


class SubRequirement(BaseSchema):
    number: str = ""
    title: str = ""
    status: AuditStatus
    earned: Progress | None = None
    in_progress: Progress | None = None
    needs: Progress | None = None
    courses: list[AuditCourse] = []
    select_from: list[str] = []


class Requirement(BaseSchema):
    code: str
    category: str = ""
    title: str = ""
    status: AuditStatus
    notes: list[str] = []
    earned: Progress | None = None
    in_progress: Progress | None = None
    needs: Progress | None = None
    subrequirements: list[SubRequirement] = []


class Audit(BaseSchema):
    student_name: str = ""
    program_title: str = ""
    program_code: str = ""
    catalog_year: str = ""
    prepared_on: str = ""
    complete: bool | None = None
    requirements: list[Requirement] = []
