"""Parse Banner PDF columns using printed header positions; retain every glyph."""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from io import BytesIO
from typing import Literal

import pdfplumber
from pdfminer.psexceptions import PSException
from pdfplumber.utils import extract_text, extract_words
from pdfplumber.utils.exceptions import PdfminerException

from app.modules.transcript.pdf_schemas import (
    PdfTranscriptCourse,
    PdfTranscriptData,
    TranscriptDiagnostic,
    TranscriptField,
    TranscriptGlyph,
    TranscriptLine,
    TranscriptPage,
    TranscriptPeriod,
    TranscriptTotals,
)

MAX_PDF_BYTES = 10 * 1024 * 1024
MAX_PDF_PAGES = 100
COLUMN_TOLERANCE = 0.5
WORD_GAP = 1.0
COURSE_NUMBER = re.compile(r"\d{3,5}[A-Z]?")
NUMBER = re.compile(r"\d+(?:\.\d+)?")
SECTIONS = {
    "TRANSFER CREDIT ACCEPTED BY INSTITUTION": "transfer",
    "INSTITUTION CREDIT": "institution",
    "COURSE(S) IN PROGRESS": "in_progress",
}
FIELD_HEADERS = (
    ("Name", "Student Type"),
    ("Program", "College", "Campus"),
    ("Major and Department", "Minor"),
    ("College", "Major", "Student Type", "Academic Standing"),
    ("College", "Major", "Student Type"),
    ("Last Academic Standing",),
    ("Current Program",),
)
COURSE_HEADERS = (
    (
        "Subject",
        "Course",
        "Campus",
        "Level",
        "Title",
        "Grade",
        "Credit",
        "Quality",
        "R",
        "CEU",
    ),
    ("Subject", "Course", "Title", "Grade", "Credit Hours", "Quality Points", "R"),
    ("Subject", "Course", "Campus", "Level", "Title", "Credit Hours"),
)
TOTAL_HEADERS = (
    "Attempt Hours",
    "Passed Hours",
    "Earned Hours",
    "CEU Hours",
    "GPA Hours",
    "Quality Points",
    "GPA",
)


def _glyph(char: dict) -> TranscriptGlyph:
    return TranscriptGlyph(
        text=char["text"],
        x0=char["x0"],
        x1=char["x1"],
        top=char["top"],
        bottom=char["bottom"],
        font=char["fontname"],
        size=char["size"],
    )


def parse_pdf(data: bytes) -> PdfTranscriptData:
    if len(data) > MAX_PDF_BYTES:
        raise ValueError("PDF exceeds the 10 MiB limit.")
    if not data.startswith(b"%PDF-"):
        raise ValueError("Expected a PDF document.")
    result = PdfTranscriptData()
    try:
        with pdfplumber.open(BytesIO(data)) as pdf:
            if len(pdf.pages) > MAX_PDF_PAGES:
                raise ValueError("PDF exceeds the 100 page limit.")
            result.metadata = {key: str(value) for key, value in pdf.metadata.items()}
            for number, page in enumerate(pdf.pages, 1):
                result.pages.append(
                    TranscriptPage(
                        number=number,
                        width=page.width,
                        height=page.height,
                        text=page.extract_text() or "",
                        character_count=len(page.chars),
                        image_count=len(page.images),
                    )
                )
                captured = set()
                for line in page.extract_text_lines(expand_ligatures=False):
                    captured.update(id(c) for c in line["chars"])
                    result.lines.append(
                        TranscriptLine(
                            id=len(result.lines),
                            page=number,
                            text=line["text"],
                            glyphs=[_glyph(c) for c in line["chars"]],
                        )
                    )
                remaining = [c for c in page.chars if id(c) not in captured]
                if remaining:
                    result.lines.append(
                        TranscriptLine(
                            id=len(result.lines),
                            page=number,
                            text="".join(c["text"] for c in remaining),
                            kind="unassigned_glyphs",
                            glyphs=[_glyph(c) for c in remaining],
                        )
                    )
                if not page.chars or page.images:
                    result.diagnostics.append(
                        TranscriptDiagnostic(
                            code="visual_review_required",
                            message=f"Page {number} contains images or no text layer; image content is not OCR parsed.",
                        )
                    )
    except (PSException, PdfminerException) as error:
        raise ValueError("The PDF is invalid or password protected.") from error
    return parse_layout(result)


def _anchors(line: TranscriptLine, labels: tuple[str, ...]) -> dict[str, float]:
    words = extract_words(
        [dict(g.model_dump(), upright=True, doctop=g.top) for g in line.glyphs],
        x_tolerance=WORD_GAP,
    )
    anchors = {}
    cursor = 0
    for label in labels:
        parts = label.split()
        for start in range(cursor, len(words)):
            if [w["text"] for w in words[start : start + len(parts)]] == parts:
                anchors[label] = words[start]["x0"]
                cursor = start + len(parts)
                break
    return anchors


def _cells(line: TranscriptLine, anchors: dict[str, float]) -> dict[str, str]:
    columns = list(anchors.items())
    cells = {}
    for index, (label, left) in enumerate(columns):
        right = columns[index + 1][1] if index + 1 < len(columns) else float("inf")
        chars = [
            dict(g.model_dump(), upright=True, doctop=g.top)
            for g in line.glyphs
            if left - COLUMN_TOLERANCE <= g.x0 < right - COLUMN_TOLERANCE
        ]
        cells[label] = (
            extract_text(chars, x_tolerance=WORD_GAP).strip() if chars else ""
        )
    return cells


def _number(value: str) -> float:
    if not NUMBER.fullmatch(value):
        raise ValueError("Missing or invalid numeric cell")
    return float(value)


def _course(
    cells: dict[str, str], period: TranscriptPeriod, line: TranscriptLine
) -> PdfTranscriptCourse:
    return PdfTranscriptCourse(
        subject=cells["Subject"],
        course_number=cells["Course"],
        title=cells["Title"],
        grade=cells.get("Grade", ""),
        credits=_number(cells.get("Credit", cells.get("Credit Hours", ""))),
        term=period.label,
        category=period.category,
        campus=cells.get("Campus"),
        level=cells.get("Level"),
        quality_points=_number(cells.get("Quality", cells.get("Quality Points", "")))
        if "Grade" in cells
        else None,
        repeat=cells.get("R") or None,
        ceu_contact_hours=_number(cells["CEU"]) if cells.get("CEU") else None,
        cells=cells,
        source_lines=[line.id],
    )


@dataclass
class _LayoutParser:
    result: PdfTranscriptData
    category: Literal["transfer", "institution", "in_progress"] = "institution"
    period: TranscriptPeriod | None = None
    columns: dict[str, float] = field(default_factory=dict)
    active_fields: list[TranscriptField] = field(default_factory=list)
    last_course: PdfTranscriptCourse | None = None
    mode: str | None = None
    totals_level: str | None = None

    def diagnostic(self, code: str, message: str, line: TranscriptLine) -> None:
        self.result.diagnostics.append(
            TranscriptDiagnostic(
                code=code,
                message=message,
                source_lines=[line.id],
            )
        )

    def header(self, line: TranscriptLine, text: str) -> bool:
        if text in SECTIONS or text == "TRANSCRIPT TOTALS":
            self.category = SECTIONS.get(text, self.category)
            self.period = None
            self.mode = None
            line.kind = "section"
        elif text.startswith("Term: ") or (
            self.category == "transfer" and re.match(r"^\w+,\d{2}:", text)
        ):
            self.start_period(line, text)
        elif any(text == " ".join(headers) for headers in FIELD_HEADERS):
            headers = next(h for h in FIELD_HEADERS if text == " ".join(h))
            self.columns = _anchors(line, headers)
            self.active_fields = []
            self.mode = "fields"
            line.kind = "field_header"
        elif text.startswith("Subject Course "):
            headers = next((h for h in COURSE_HEADERS if text == " ".join(h)), ())
            self.columns = _anchors(line, headers)
            self.mode = "courses"
            self.last_course = None
            line.kind = "course_header" if headers else "unrecognized"
        elif "Attempt Hours Passed Hours" in text:
            labels = tuple(label for label in TOTAL_HEADERS if label in text)
            self.columns = _anchors(line, labels)
            self.mode = "totals"
            self.totals_level = None
            line.kind = "totals_header"
        else:
            return False
        return True

    def start_period(self, line: TranscriptLine, text: str) -> None:
        label, separator, institution = text.partition(": ")
        self.period = TranscriptPeriod(
            label=institution if label == "Term" else label,
            category=self.category,
            source_institution=institution if label != "Term" and separator else None,
            source_lines=[line.id],
        )
        self.result.periods.append(self.period)
        self.mode = None
        line.kind = "period"

    def totals(self, line: TranscriptLine, text: str) -> None:
        if text.startswith("(") and text.endswith(")"):
            self.totals_level = text[1:-1]
            line.kind = "level"
            return
        if not re.match(
            r"^(Current Term|Cumulative|Total Institution|Total Transfer|Overall)\s",
            text,
        ):
            return
        label = re.split(r"\s+\d", text, maxsplit=1)[0]
        cells = _cells(line, self.columns)
        try:
            if len(cells) != 6:
                raise ValueError("Unexpected totals columns")
            for value in cells.values():
                _number(value)
            total = TranscriptTotals(
                label=label,
                level=self.totals_level,
                values=cells,
                source_lines=[line.id],
            )
            (self.period.totals if self.period else self.result.totals).append(total)
            if label == "Overall":
                self.result.gpa = _number(cells["GPA"])
            line.kind = "totals"
        except ValueError, KeyError:
            self.diagnostic(
                "invalid_totals", "Totals row has missing or invalid cells.", line
            )

    def courses(self, line: TranscriptLine, text: str) -> None:
        if text in ("Hours Points Contact", "Hours"):
            line.kind = "course_header_continuation"
            return
        if not self.period or not self.columns:
            return
        cells = _cells(line, self.columns)
        if re.fullmatch(r"[A-Z]{2,8}", cells["Subject"]) and COURSE_NUMBER.fullmatch(
            cells["Course"]
        ):
            self.last_course = None
            try:
                self.last_course = _course(cells, self.period, line)
                self.result.courses.append(self.last_course)
                line.kind = "course"
            except ValueError:
                self.diagnostic(
                    "invalid_course",
                    "Course row has missing or invalid numeric cells.",
                    line,
                )
        elif (
            self.last_course
            and cells.get("Title")
            and all(not value for key, value in cells.items() if key != "Title")
        ):
            self.last_course.title += " " + cells["Title"]
            self.last_course.cells["Title"] += " " + cells["Title"]
            self.last_course.source_lines.append(line.id)
            line.kind = "course_continuation"

    def fields(self, line: TranscriptLine) -> None:
        cells = _cells(line, self.columns)
        if not any(cells.values()):
            return
        destination = self.period.fields if self.period else self.result.student
        if not self.active_fields:
            self.active_fields = [
                TranscriptField(label=label, value=value, source_lines=[line.id])
                for label, value in cells.items()
            ]
            destination.extend(self.active_fields)
        else:
            for item in self.active_fields:
                if cells[item.label]:
                    item.value += " " + cells[item.label]
                    item.source_lines.append(line.id)
        line.kind = "field_value"

    def document_heading(self, line: TranscriptLine, text: str) -> bool:
        if text in ("Transcript Data", "STUDENT INFORMATION"):
            line.kind = "heading"
        elif text == "Unofficial Academic Transcript":
            self.result.title = text
            line.kind = "document_title"
        elif text.startswith("This is not an official transcript."):
            self.result.notices.append(text)
            line.kind = "notice"
        elif line.id == 0:
            self.result.institution = text
            line.kind = "institution"
        else:
            return False
        return True

    def consume(self, line: TranscriptLine) -> None:
        text = unicodedata.normalize("NFKC", line.text)
        if line.kind == "unassigned_glyphs":
            if text.strip():
                self.diagnostic(
                    "unassigned_glyphs",
                    "Glyphs outside extracted lines require review.",
                    line,
                )
            return
        if self.document_heading(line, text) or self.header(line, text):
            return
        if self.mode == "totals":
            self.totals(line, text)
        elif self.mode == "courses":
            self.courses(line, text)
        elif self.mode == "fields":
            self.fields(line)


def parse_layout(result: PdfTranscriptData) -> PdfTranscriptData:
    """Interpret a fresh extracted layout; unsupported lines become diagnostics."""
    parser = _LayoutParser(result)
    for line in result.lines:
        parser.consume(line)
        if line.kind == "unrecognized":
            parser.diagnostic(
                "unrecognized_line", "Line retained but not interpreted.", line
            )
    if not result.courses:
        result.diagnostics.append(
            TranscriptDiagnostic(
                code="no_courses", message="No supported course rows were found."
            )
        )
    return result
