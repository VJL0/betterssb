from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated

from pydantic import Field

from app.shared.schemas import BaseSchema

TermCode = Annotated[str, Field(pattern=r"^\d{6}$", description="Banner term code")]
Crn = Annotated[str, Field(pattern=r"^\d{5}$", description="Five-digit CRN")]


class SeatWatchCreate(BaseSchema):
    term: TermCode
    crn: Crn


class SeatWatchResponse(BaseSchema):
    """A watched section with Banner's seats from the last check."""

    id: uuid.UUID
    term: str
    crn: str
    title: str
    subject: str
    course_number: str
    section: str
    seats_available: int
    maximum_enrollment: int
    wait_count: int
    wait_capacity: int
    wait_available: int
    checked_at: datetime
    notified_at: datetime | None
    created_at: datetime


class SeatCheckSummary(BaseSchema):
    sections: int
    failed: int
    emailed: int
