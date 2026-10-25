"""Academic responses and content-free parser error reporting."""

from __future__ import annotations

from collections import Counter

import sentry_sdk

from app.modules.transcript.pdf_parser import parse_pdf
from app.modules.transcript.pdf_schemas import (
    AcademicCourse,
    AcademicDiagnostic,
    AcademicPeriod,
    AcademicTotals,
    AcademicTranscript,
    PdfTranscriptData,
    TranscriptInspection,
)

PROGRAM_FIELDS = frozenset(
    {"Current Program", "Program", "College", "Campus", "Major and Department", "Minor"}
)
ERROR_CODES = frozenset(
    {
        "invalid_course",
        "invalid_totals",
        "unrecognized_line",
        "unassigned_glyphs",
        "no_courses",
    }
)
INVALID_PDF_MESSAGE = "We could not read this PDF. Upload a valid, unprotected transcript PDF under 10 MiB and 100 pages."
INCOMPLETE_MESSAGE = "We could not read the complete transcript. Open the transcript data page to review the parsing issues."


def academic_data(result: PdfTranscriptData) -> AcademicTranscript:
    return AcademicTranscript(
        courses=[AcademicCourse.model_validate(c.model_dump()) for c in result.courses],
        gpa=result.gpa,
        institution=result.institution,
        program={f.label: f.value for f in result.student if f.label in PROGRAM_FIELDS},
        periods=[
            AcademicPeriod(
                label=p.label,
                category=p.category,
                source_institution=p.source_institution,
                totals=[
                    AcademicTotals.model_validate(t.model_dump())
                    for t in p.totals
                    if t.label != "Cumulative"
                ],
            )
            for p in result.periods
        ],
        totals=[AcademicTotals.model_validate(t.model_dump()) for t in result.totals],
        diagnostics=[
            AcademicDiagnostic.model_validate(d.model_dump())
            for d in result.diagnostics
        ],
    )


def _report_errors(codes: list[str]) -> None:
    if not codes:
        return
    # Never send PDF contents, student fields, exception messages, or glyphs.
    sentry_sdk.capture_event(
        {
            "message": "Transcript PDF parsing failed",
            "level": "error",
            "fingerprint": ["transcript-pdf", *sorted(set(codes))],
            "tags": {"component": "transcript-parser"},
            "extra": {"diagnostic_counts": dict(Counter(codes))},
        }
    )


def inspect_pdf(document: bytes) -> TranscriptInspection:
    try:
        details = parse_pdf(document)
    except ValueError as error:
        _report_errors(["invalid_pdf"])
        raise ValueError(INVALID_PDF_MESSAGE) from error
    errors = [d.code for d in details.diagnostics if d.code in ERROR_CODES]
    _report_errors(errors)
    return TranscriptInspection(
        valid=not errors, data=academic_data(details), details=details
    )
