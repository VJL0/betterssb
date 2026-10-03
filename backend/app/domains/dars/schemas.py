from __future__ import annotations

import re
from typing import Literal

from pydantic import field_validator

from app.shared.schemas.base import BaseSchema

AuditStatus = Literal["complete", "incomplete", "in_progress", "none"]

_SESSION_ID_RE = re.compile(r"^[A-Za-z0-9._\-]{8,256}$")


class RunAuditRequest(BaseSchema):
    session_id: str

    @field_validator("session_id")
    @classmethod
    def _clean_session_id(cls, value: str) -> str:
        """Accept the bare cookie value or a pasted `JSESSIONID=...` pair."""
        value = value.strip().removeprefix("JSESSIONID=").strip().strip(";")
        if not _SESSION_ID_RE.match(value):
            raise ValueError("Not a valid JSESSIONID value")
        return value


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
