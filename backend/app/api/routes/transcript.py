from __future__ import annotations

from fastapi import APIRouter, Body
from pydantic import BaseModel

from app.models.transcript import TranscriptCourse, TranscriptData
from app.services.transcript_service import TranscriptService

router = APIRouter(prefix="/transcript", tags=["transcript"])

_service = TranscriptService()


class PrereqCheckRequest(BaseModel):
    completed: list[TranscriptCourse]
    required: list[str]


@router.post("/parse", response_model=TranscriptData)
def parse_transcript(text: str = Body(..., media_type="text/plain")) -> TranscriptData:
    """Parse a pasted transcript into structured course data."""
    return _service.parse_transcript(text)


@router.post("/check-prereqs", response_model=dict[str, bool])
def check_prerequisites(body: PrereqCheckRequest) -> dict[str, bool]:
    """Check which prerequisite courses have been completed."""
    return _service.check_prerequisites(
        completed=body.completed,
        required=body.required,
    )
