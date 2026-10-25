from unittest.mock import patch

import pytest

from app.modules.transcript.pdf_parser import parse_layout
from app.modules.transcript.pdf_schemas import TranscriptDiagnostic
from app.modules.transcript.pdf_service import academic_data, inspect_pdf
from tests.unit.test_transcript_pdf import layout


def test_simple_data_keeps_academics_without_source_content():
    result = academic_data(parse_layout(layout()))
    serialized = result.model_dump()
    assert len(result.courses) == 28
    assert result.gpa == 3.44
    assert result.program["Minor"] == "Data Science: Comp Analytics"
    assert "Name" not in result.program
    assert not {"lines", "pages", "metadata", "student"} & serialized.keys()
    assert "cells" not in serialized["courses"][0]
    assert "sourceLines" not in serialized["courses"][0]
    assert all(t.label != "Cumulative" for p in result.periods for t in p.totals)


def test_sentry_contains_only_safe_diagnostic_counts():
    result = parse_layout(layout())
    result.diagnostics = [
        TranscriptDiagnostic(
            code="invalid_course", message="PRIVATE CONTENT", source_lines=[4]
        )
    ]
    with (
        patch("app.modules.transcript.pdf_service.parse_pdf", return_value=result),
        patch("app.modules.transcript.pdf_service.sentry_sdk.capture_event") as capture,
    ):
        inspection = inspect_pdf(b"PRIVATE PDF CONTENT")
    assert not inspection.valid
    event = capture.call_args.args[0]
    assert event["level"] == "error"
    assert event["extra"] == {"diagnostic_counts": {"invalid_course": 1}}
    assert "PRIVATE" not in str(event)
    assert "glyphs" not in str(event)


def test_image_notice_does_not_create_sentry_error():
    result = parse_layout(layout())
    result.diagnostics = [
        TranscriptDiagnostic(code="visual_review_required", message="Review image")
    ]
    with (
        patch("app.modules.transcript.pdf_service.parse_pdf", return_value=result),
        patch("app.modules.transcript.pdf_service.sentry_sdk.capture_event") as capture,
    ):
        assert inspect_pdf(b"PDF").valid
    capture.assert_not_called()


async def test_simple_api_response(client):
    with patch(
        "app.modules.transcript.pdf_service.parse_pdf",
        return_value=parse_layout(layout()),
    ):
        response = await client.post(
            "/api/transcript/parse-pdf",
            content=b"PDF",
            headers={"Content-Type": "application/pdf"},
        )
    assert response.status_code == 200
    assert len(response.json()["courses"]) == 28
    assert "lines" not in response.json()


async def test_incomplete_api_returns_simple_error(client):
    result = parse_layout(layout())
    result.diagnostics = [
        TranscriptDiagnostic(code="invalid_course", message="PRIVATE CONTENT")
    ]
    with (
        patch("app.modules.transcript.pdf_service.parse_pdf", return_value=result),
        patch("app.modules.transcript.pdf_service.sentry_sdk.capture_event") as capture,
    ):
        response = await client.post(
            "/api/transcript/parse-pdf",
            content=b"PDF",
            headers={"Content-Type": "application/pdf"},
        )
    assert response.status_code == 422
    assert "PRIVATE" not in response.text
    capture.assert_called_once()


def test_invalid_pdf_reports_sanitized_failure():
    with (
        patch("app.modules.transcript.pdf_service.sentry_sdk.capture_event") as capture,
        pytest.raises(ValueError, match="We could not read"),
    ):
        inspect_pdf(b"PRIVATE invalid bytes")
    assert capture.call_args.args[0]["extra"] == {
        "diagnostic_counts": {"invalid_pdf": 1}
    }
