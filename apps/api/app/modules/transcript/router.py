from __future__ import annotations

from fastapi import APIRouter, Body, HTTPException

from app.modules.transcript.pdf_schemas import AcademicTranscript, TranscriptInspection
from app.modules.transcript.pdf_service import INCOMPLETE_MESSAGE, inspect_pdf

router = APIRouter(prefix="/transcript", tags=["transcript"])


@router.post("/parse-pdf", response_model=AcademicTranscript)
def parse_transcript_pdf(
    document: bytes = Body(..., media_type="application/pdf"),
) -> AcademicTranscript:
    """Return academic data; report incomplete parsing through a simple error."""
    inspection = _inspect(document)
    if not inspection.valid:
        raise HTTPException(status_code=422, detail=INCOMPLETE_MESSAGE)
    return inspection.data


@router.post("/parse-pdf/data", response_model=TranscriptInspection)
def inspect_transcript_pdf(
    document: bytes = Body(..., media_type="application/pdf"),
) -> TranscriptInspection:
    """Inspect simple and detailed JSON without storing the uploaded document."""
    return _inspect(document)


def _inspect(document: bytes) -> TranscriptInspection:
    try:
        return inspect_pdf(document)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
