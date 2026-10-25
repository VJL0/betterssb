from pathlib import Path

import pytest

from app.modules.transcript.pdf_parser import parse_layout, parse_pdf
from app.modules.transcript.pdf_schemas import PdfTranscriptData

FIXTURE = Path(__file__).parents[1] / "fixtures/transcript/temple-layout.json"


def layout():
    return PdfTranscriptData.model_validate_json(FIXTURE.read_text())


def test_all_rows_and_source_characters():
    source = layout()
    result = parse_layout(source)
    assert len(result.courses) == 28
    assert [
        sum(c.category == kind for c in result.courses)
        for kind in ("transfer", "institution", "in_progress")
    ] == [3, 20, 5]
    assert len(result.periods) == 8
    assert len(result.totals) == 3
    assert sum(len(p.totals) for p in result.periods) == 12
    assert result.gpa == 3.44
    assert result.diagnostics == []
    assert all(line.kind != "unrecognized" for line in result.lines)
    assert sum(len(line.glyphs) for line in result.lines) == sum(
        p.character_count for p in result.pages
    )
    assert len(result.lines) == 123


def test_columns_wrapping_and_blank_cells():
    result = parse_layout(layout())
    student = {field.label: field.value for field in result.student}
    assert (
        student["Major and Department"] == "Computer Science, CST:Computer & Info Sci"
    )
    assert student["Minor"] == "Data Science: Comp Analytics"
    assert student["Current Program"] == "Bachelor of Science"
    course = next(c for c in result.courses if c.course_number == "3223")
    assert course.title == "Data Structures & Algorithms"
    assert course.grade == "A"
    assert course.repeat is None
    assert course.cells["R"] == ""
    assert course.ceu_contact_hours is None
    assert next(c for c in result.courses if c.course_number == "3207").title.endswith(
        "Oper Sys"
    )
    assert next(c for c in result.courses if c.course_number == "1166").title.endswith(
        "Computing I"
    )
    assert result.periods[-1].label == "2026 Fall"
    assert result.courses[-1].term == "2026 Fall"
    assert result.courses[-1].grade == ""
    assert result.courses[-1].quality_points is None
    assert sum(c.credits for c in result.courses if c.category == "in_progress") == 18
    assert result.totals[-1].values["CEU Hours"] == "69.000"
    assert result.totals[-1].values["GPA Hours"] == "60.00"
    assert [c.grade for c in result.courses if c.course_number == "1031"] == [
        "NT",
        "TR",
    ]
    assert [c.grade for c in result.courses if c.course_number == "1042"] == ["W", "A-"]


def test_unknown_line_is_reported_without_loss():
    source = layout()
    source.lines[-1].kind = "unrecognized"
    source.lines[-1].text = "Unfamiliar content"
    source.lines[-1].glyphs = []
    result = parse_layout(source)
    assert any(d.code == "unrecognized_line" for d in result.diagnostics)
    assert result.lines[-1].text == "Unfamiliar content"


def test_invalid_pdf():
    with pytest.raises(ValueError, match="PDF"):
        parse_pdf(b"not a pdf")


def test_missing_numeric_cell_is_diagnostic():
    source = layout()
    row = next(line for line in source.lines if line.text.startswith("CIS 3223"))
    row.glyphs = [g for g in row.glyphs if not (379 < g.x0 < 418)]
    result = parse_layout(source)
    assert any(d.code == "invalid_course" for d in result.diagnostics)


def simple_pdf(content: bytes) -> bytes:
    """A real, minimal PDF exercises pdfminer without a test-only PDF dependency."""
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length "
        + str(len(content)).encode()
        + b" >>\nstream\n"
        + content
        + b"\nendstream",
    ]
    document = b"%PDF-1.4\n"
    offsets = [0]
    for index, obj in enumerate(objects, 1):
        offsets.append(len(document))
        document += f"{index} 0 obj\n".encode() + obj + b"\nendobj\n"
    xref = len(document)
    document += f"xref\n0 {len(offsets)}\n0000000000 65535 f \n".encode()
    document += b"".join(f"{offset:010d} 00000 n \n".encode() for offset in offsets[1:])
    document += f"trailer\n<< /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF".encode()
    return document


def test_real_pdf_extraction_preserves_spaces():
    result = parse_pdf(simple_pdf(b"BT /F1 12 Tf 20 750 Td (Example University) Tj ET"))
    assert result.institution == "Example University"
    assert result.pages[0].character_count == len("Example University")
    assert sum(len(line.glyphs) for line in result.lines) == len("Example University")
    assert [d.code for d in result.diagnostics] == ["no_courses"]


def test_blank_page_requests_visual_review():
    result = parse_pdf(simple_pdf(b""))
    assert {d.code for d in result.diagnostics} == {
        "no_courses",
        "visual_review_required",
    }


@pytest.mark.parametrize("data", [b"%PDF-1.4\ninvalid", b"", b"not a PDF"])
async def test_invalid_pdf_api(client, data):
    response = await client.post(
        "/api/transcript/parse-pdf",
        content=data,
        headers={"Content-Type": "application/pdf"},
    )
    assert response.status_code == 422
    assert response.headers["content-type"] == "application/problem+json"


async def test_pdf_api(client):
    response = await client.post(
        "/api/transcript/parse-pdf/data",
        content=simple_pdf(b"BT /F1 12 Tf 20 750 Td (Example University) Tj ET"),
        headers={"Content-Type": "application/pdf"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["details"]["pages"][0]["characterCount"] == 18
    assert body["data"]["institution"] == "Example University"


def test_ligatures_and_term_history():
    result = parse_layout(layout())
    assert result.title == "Unofficial Academic Transcript"
    assert len(result.notices) == 1
    assert result.courses[0].title == "Differential and Integral Cal"
    assert result.periods[0].source_institution == "Advanced Placement Exam"
    assert result.periods[0].totals[0].values["Earned Hours"] == "0.000"
    assert {f.label: f.value for f in result.periods[2].fields} == {
        "College": "Continuing Studies",
        "Major": "Undeclared-Continuing Studies",
        "Student Type": "High School Student",
    }
    assert (
        next(
            f for f in result.periods[-2].fields if f.label == "Last Academic Standing"
        ).value
        == "Academic Good Standing"
    )


def test_shifted_columns_are_inferred_from_headers():
    source = layout()
    for line in source.lines:
        for glyph in line.glyphs:
            glyph.x0 += 20
            glyph.x1 += 20
    result = parse_layout(source)
    assert len(result.courses) == 28
    assert result.diagnostics == []


def test_input_size_limit():
    from app.modules.transcript.pdf_parser import MAX_PDF_BYTES

    with pytest.raises(ValueError, match="10 MiB"):
        parse_pdf(b"%PDF-" + b" " * MAX_PDF_BYTES)
