from __future__ import annotations

from typing import Literal

from pydantic import Field

from app.modules.transcript.schemas import TranscriptCourse
from app.shared.schemas import BaseSchema


class TranscriptGlyph(BaseSchema):
    text: str
    x0: float
    x1: float
    top: float
    bottom: float
    font: str
    size: float


class TranscriptLine(BaseSchema):
    id: int
    page: int
    text: str
    glyphs: list[TranscriptGlyph]
    kind: str = "unrecognized"


class TranscriptPage(BaseSchema):
    number: int
    width: float
    height: float
    text: str
    character_count: int
    image_count: int


class TranscriptField(BaseSchema):
    label: str
    value: str
    source_lines: list[int]


class TranscriptTotals(BaseSchema):
    label: str
    level: str | None = None
    # Preserve the printed labels (including CEU Hours) and decimal precision.
    values: dict[str, str]
    source_lines: list[int]


class PdfTranscriptCourse(TranscriptCourse):
    category: Literal["transfer", "institution", "in_progress"]
    campus: str | None = None
    level: str | None = None
    quality_points: float | None = None
    repeat: str | None = None
    ceu_contact_hours: float | None = None
    cells: dict[str, str]
    source_lines: list[int]


class TranscriptPeriod(BaseSchema):
    label: str
    category: Literal["transfer", "institution", "in_progress"]
    source_institution: str | None = None
    fields: list[TranscriptField] = Field(default_factory=list)
    totals: list[TranscriptTotals] = Field(default_factory=list)
    source_lines: list[int] = Field(default_factory=list)


class TranscriptDiagnostic(BaseSchema):
    code: str
    message: str
    source_lines: list[int] = Field(default_factory=list)


class PdfTranscriptData(BaseSchema):
    courses: list[PdfTranscriptCourse] = Field(default_factory=list)
    gpa: float | None = None
    institution: str | None = None
    title: str | None = None
    notices: list[str] = Field(default_factory=list)
    student: list[TranscriptField] = Field(default_factory=list)
    periods: list[TranscriptPeriod] = Field(default_factory=list)
    totals: list[TranscriptTotals] = Field(default_factory=list)
    metadata: dict[str, str] = Field(default_factory=dict)
    pages: list[TranscriptPage] = Field(default_factory=list)
    lines: list[TranscriptLine] = Field(default_factory=list)
    diagnostics: list[TranscriptDiagnostic] = Field(default_factory=list)


class AcademicCourse(TranscriptCourse):
    category: Literal["transfer", "institution", "in_progress"]
    quality_points: float | None
    repeat: str | None


class AcademicTotals(BaseSchema):
    label: str
    level: str | None
    values: dict[str, str]


class AcademicPeriod(BaseSchema):
    label: str
    category: Literal["transfer", "institution", "in_progress"]
    source_institution: str | None
    totals: list[AcademicTotals]


class AcademicDiagnostic(BaseSchema):
    code: str
    message: str


class AcademicTranscript(BaseSchema):
    courses: list[AcademicCourse]
    gpa: float | None
    institution: str | None
    program: dict[str, str]
    periods: list[AcademicPeriod]
    totals: list[AcademicTotals]
    diagnostics: list[AcademicDiagnostic]


class TranscriptInspection(BaseSchema):
    valid: bool
    data: AcademicTranscript
    details: PdfTranscriptData
