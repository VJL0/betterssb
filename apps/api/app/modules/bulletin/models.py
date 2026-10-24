"""The Bulletin's tables, in the `bulletin` Postgres schema.

Every academic fact belongs to an import batch: one edition's records as one
run of the ingester produced them. Batches are written once and never edited.
An edition's published data is the batch its `release` row points at, so
publishing (or rolling back) is a single-row update and readers never see a
half-written import. Superseded batches stay until pruned explicitly.

Identities that outlive an edition (a course code, a program's path) live in
their own tables; what an edition says about them lives in `*_version` rows
keyed by batch. Two editions never share a version row, and nothing here
merges courses or programs by title.

Raw evidence stays in the ingester's content-addressed store; `source_document`
records each snapshot's URL and hash so any row's `source` can be traced back
to the exact bytes it came from.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    CheckConstraint,
    Computed,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, TSVECTOR
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

SCHEMA = "bulletin"
# Course and program text is English; `simple` would miss stemming
# ("programming" for "program").
SEARCH_CONFIG = "english"
BATCH_STATUSES = ("staged", "published", "superseded")


class Base(DeclarativeBase):
    """The Bulletin's own metadata: its tables use Postgres types (JSONB,
    TSVECTOR, arrays) and a schema SQLite lacks, so tests that build the app's
    tables in SQLite never see them."""


def _fk(table: str, *, ondelete: str = "RESTRICT") -> ForeignKey:
    return ForeignKey(f"{SCHEMA}.{table}.id", ondelete=ondelete)


class Edition(Base):
    """A Bulletin year ("2026-2027"). Its level scopes (undergraduate,
    graduate) are published together on bulletin.temple.edu."""

    __tablename__ = "edition"
    __table_args__ = ({"schema": SCHEMA},)

    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True)
    code: Mapped[str] = mapped_column(String(9), unique=True)
    start_year: Mapped[int] = mapped_column(SmallInteger)
    # Where the edition was published ("bulletin.temple.edu/archives/2024-2025/").
    source_url: Mapped[str] = mapped_column(Text)


class ImportBatch(Base):
    __tablename__ = "import_batch"
    __table_args__ = (
        # The same inputs and code produce the same batch: re-importing is a no-op.
        UniqueConstraint("edition_id", "fingerprint"),
        CheckConstraint(f"status IN {BATCH_STATUSES}", name="batch_status"),
        {"schema": SCHEMA},
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    edition_id: Mapped[int] = mapped_column(_fk("edition"))
    # SHA-256 over the interpreted inputs and the versions that produced them.
    fingerprint: Mapped[str] = mapped_column(String(64))
    extractor_version: Mapped[str] = mapped_column(String(20))
    interpreter_version: Mapped[str] = mapped_column(String(20))
    rules_version: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(12), default="staged")
    counts: Mapped[dict[str, int]] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class Release(Base):
    """The batch an edition currently publishes."""

    __tablename__ = "release"
    __table_args__ = ({"schema": SCHEMA},)

    edition_id: Mapped[int] = mapped_column(_fk("edition"), primary_key=True)
    batch_id: Mapped[int] = mapped_column(_fk("import_batch"), unique=True)
    published_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class ReleaseEvent(Base):
    """Every publish and rollback, append-only."""

    __tablename__ = "release_event"
    __table_args__ = ({"schema": SCHEMA},)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    edition_id: Mapped[int] = mapped_column(_fk("edition"))
    batch_id: Mapped[int] = mapped_column(_fk("import_batch"))
    previous_batch_id: Mapped[int | None] = mapped_column(_fk("import_batch"))
    action: Mapped[str] = mapped_column(String(12))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class SourceDocument(Base):
    """One stored snapshot of one URL. Shared by batches; never changes."""

    __tablename__ = "source_document"
    __table_args__ = (UniqueConstraint("url", "sha256"), {"schema": SCHEMA})

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    url: Mapped[str] = mapped_column(Text)
    sha256: Mapped[str] = mapped_column(String(64))
    content_type: Mapped[str] = mapped_column(Text, default="")
    fetched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # How the bytes were obtained ("crawl", "prior_capture", "manual_download").
    acquisition: Mapped[str] = mapped_column(String(40), default="")


class AcademicUnit(Base):
    """A school, college or department as one edition names it."""

    __tablename__ = "academic_unit"
    __table_args__ = (UniqueConstraint("batch_id", "slug"), {"schema": SCHEMA})

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    batch_id: Mapped[int] = mapped_column(_fk("import_batch"))
    slug: Mapped[str] = mapped_column(Text)
    name: Mapped[str] = mapped_column(Text)
    parent_slug: Mapped[str | None] = mapped_column(Text)
    kind: Mapped[str] = mapped_column(String(20), default="")
    level: Mapped[str] = mapped_column(String(20), default="")
    url: Mapped[str] = mapped_column(Text)
    source_document_id: Mapped[int | None] = mapped_column(_fk("source_document"))


class Course(Base):
    """A course code. Identity only: what the course is in an edition is a
    `CourseVersion`, and renumberings are not inferred."""

    __tablename__ = "course"
    __table_args__ = (UniqueConstraint("subject", "number"), {"schema": SCHEMA})

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    subject: Mapped[str] = mapped_column(String(5))
    number: Mapped[str] = mapped_column(String(5))
    code: Mapped[str] = mapped_column(
        String(11), Computed("subject || ' ' || number", persisted=True)
    )


class CourseVersion(Base):
    __tablename__ = "course_version"
    __table_args__ = (
        UniqueConstraint("batch_id", "course_id"),
        CheckConstraint("credits_min <= credits_max", name="credit_range"),
        Index("ix_course_version_course", "course_id"),
        Index("ix_course_version_search", "search", postgresql_using="gin"),
        Index(
            "ix_course_version_title_trgm",
            "title",
            postgresql_using="gin",
            postgresql_ops={"title": "gin_trgm_ops"},
        ),
        {"schema": SCHEMA},
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    batch_id: Mapped[int] = mapped_column(_fk("import_batch"))
    course_id: Mapped[int] = mapped_column(_fk("course"))
    title: Mapped[str] = mapped_column(Text)
    description: Mapped[str] = mapped_column(Text, default="")
    credits_text: Mapped[str] = mapped_column(Text)
    credits_min: Mapped[Decimal] = mapped_column(Numeric(5, 2))
    credits_max: Mapped[Decimal] = mapped_column(Numeric(5, 2))
    # "0 or 3" allows only these values; a range leaves it empty.
    credit_options: Mapped[list[Decimal]] = mapped_column(
        ARRAY(Numeric(5, 2)), default=list
    )
    # Level listings that print it ("undergraduate", "graduate").
    levels: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list)
    # Restrictions, repeatability and other labeled parts, verbatim.
    parts: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)
    source_document_id: Mapped[int] = mapped_column(_fk("source_document"))
    source: Mapped[dict[str, Any]] = mapped_column(JSONB)
    search: Mapped[str] = mapped_column(
        TSVECTOR,
        Computed(
            f"setweight(to_tsvector('{SEARCH_CONFIG}', title), 'A') || "
            f"setweight(to_tsvector('{SEARCH_CONFIG}', description), 'B')",
            persisted=True,
        ),
    )


class CourseAttribute(Base):
    """A Banner attribute an edition prints for a course (GenEd, WI…)."""

    __tablename__ = "course_attribute"
    __table_args__ = (
        Index("ix_course_attribute_attribute", "attribute"),
        {"schema": SCHEMA},
    )

    course_version_id: Mapped[int] = mapped_column(
        _fk("course_version", ondelete="CASCADE"), primary_key=True
    )
    attribute: Mapped[str] = mapped_column(Text, primary_key=True)


class CourseRequisite(Base):
    __tablename__ = "course_requisite"
    __table_args__ = (
        UniqueConstraint("course_version_id", "kind"),
        {"schema": SCHEMA},
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    course_version_id: Mapped[int] = mapped_column(
        _fk("course_version", ondelete="CASCADE")
    )
    kind: Mapped[str] = mapped_column(String(14))
    source_text: Mapped[str] = mapped_column(Text)
    # `RequisiteExpression`, or null when nothing could be parsed.
    expression: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    interpretation: Mapped[str] = mapped_column(String(14))
    notes: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list)


class CourseReference(Base):
    """A course an edition's entry for another course names, so "what needs
    CIS 1068?" is an index lookup. The referenced code may have no version in
    the edition (discontinued, or never listed); that's kept, not dropped."""

    __tablename__ = "course_reference"
    __table_args__ = (
        Index("ix_course_reference_referenced", "referenced_course_id"),
        {"schema": SCHEMA},
    )

    course_version_id: Mapped[int] = mapped_column(
        _fk("course_version", ondelete="CASCADE"), primary_key=True
    )
    referenced_course_id: Mapped[int] = mapped_column(_fk("course"), primary_key=True)
    # "prerequisite", "corequisite" or "mentioned" (description and other parts).
    relation: Mapped[str] = mapped_column(String(14), primary_key=True)


class Program(Base):
    """A program's identity: its path within an edition
    (`/undergraduate/science-technology/computer-science-bs/`)."""

    __tablename__ = "program"
    __table_args__ = ({"schema": SCHEMA},)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    path: Mapped[str] = mapped_column(Text, unique=True)


class ProgramVersion(Base):
    __tablename__ = "program_version"
    __table_args__ = (
        UniqueConstraint("batch_id", "program_id"),
        Index("ix_program_version_program", "program_id"),
        Index("ix_program_version_unit", "batch_id", "unit_slug"),
        Index("ix_program_version_search", "search", postgresql_using="gin"),
        Index(
            "ix_program_version_name_trgm",
            "name",
            postgresql_using="gin",
            postgresql_ops={"name": "gin_trgm_ops"},
        ),
        {"schema": SCHEMA},
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    batch_id: Mapped[int] = mapped_column(_fk("import_batch"))
    program_id: Mapped[int] = mapped_column(_fk("program"))
    name: Mapped[str] = mapped_column(Text)
    # "undergraduate", "graduate" or "professional".
    level: Mapped[str] = mapped_column(String(20))
    # Open vocabularies, not enums: "major", "minor", "certificate"…; "BS", "PhD"…
    credential: Mapped[str] = mapped_column(Text, default="")
    award: Mapped[str] = mapped_column(Text, default="")
    program_code: Mapped[str | None] = mapped_column(Text)
    unit_slug: Mapped[str | None] = mapped_column(Text)
    campuses: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list)
    # Labeled overview facts and anything metadata parsing left unresolved.
    facts: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    # The whole `RequirementTree`, so a program page is one row read.
    requirements: Mapped[dict[str, Any]] = mapped_column(JSONB)
    url: Mapped[str] = mapped_column(Text)
    source_document_id: Mapped[int] = mapped_column(_fk("source_document"))
    search: Mapped[str] = mapped_column(
        TSVECTOR,
        Computed(f"to_tsvector('{SEARCH_CONFIG}', name)", persisted=True),
    )


class RequirementNodeRow(Base):
    """Program requirement trees flattened, one row per node, for queries across
    programs ("which programs require CIS 2168?", "what's still uninterpreted?").
    The tree in `program_version.requirements` is the copy served whole."""

    __tablename__ = "requirement_node"
    __table_args__ = (
        Index("ix_requirement_node_course", "course_id"),
        Index("ix_requirement_node_interpretation", "interpretation"),
        {"schema": SCHEMA},
    )

    program_version_id: Mapped[int] = mapped_column(
        _fk("program_version", ondelete="CASCADE"), primary_key=True
    )
    node_id: Mapped[str] = mapped_column(Text, primary_key=True)
    parent_node_id: Mapped[str | None] = mapped_column(Text)
    position: Mapped[int] = mapped_column(Integer)
    kind: Mapped[str] = mapped_column(String(14))
    label: Mapped[str] = mapped_column(Text, default="")
    course_id: Mapped[int | None] = mapped_column(_fk("course"))
    # Roots only: "requirement", "curriculum", "admission", "academic_plan"…
    role: Mapped[str | None] = mapped_column(String(20))
    min_courses: Mapped[int | None] = mapped_column(Integer)
    max_courses: Mapped[int | None] = mapped_column(Integer)
    min_credits: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    max_credits: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    interpretation: Mapped[str] = mapped_column(String(14))
    validation: Mapped[str] = mapped_column(String(22))


class AcademicPlan(Base):
    """A suggested semester-by-semester plan. Advice, not a requirement."""

    __tablename__ = "academic_plan"
    __table_args__ = (
        UniqueConstraint("program_version_id", "position"),
        {"schema": SCHEMA},
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    program_version_id: Mapped[int] = mapped_column(
        _fk("program_version", ondelete="CASCADE")
    )
    position: Mapped[int] = mapped_column(SmallInteger)
    label: Mapped[str] = mapped_column(Text)
    total_hours: Mapped[str] = mapped_column(Text, default="")
    # Terms with their rows and footnotes, as printed.
    terms: Mapped[list[dict[str, Any]]] = mapped_column(JSONB)
    footnotes: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)
    source: Mapped[dict[str, Any]] = mapped_column(JSONB)


class PolicySection(Base):
    """A headed section of a policy, General Education, college or
    information page, verbatim, with a coarse topic for filtering."""

    __tablename__ = "policy_section"
    __table_args__ = (
        UniqueConstraint("batch_id", "url", "position"),
        Index("ix_policy_section_topic", "batch_id", "topic"),
        Index("ix_policy_section_search", "search", postgresql_using="gin"),
        {"schema": SCHEMA},
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    batch_id: Mapped[int] = mapped_column(_fk("import_batch"))
    url: Mapped[str] = mapped_column(Text)
    position: Mapped[int] = mapped_column(Integer)
    page_kind: Mapped[str] = mapped_column(String(20))
    page_title: Mapped[str] = mapped_column(Text)
    headings: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list)
    tab: Mapped[str | None] = mapped_column(Text)
    topic: Mapped[str] = mapped_column(String(30))
    body: Mapped[str] = mapped_column(Text)
    source_document_id: Mapped[int] = mapped_column(_fk("source_document"))
    sources: Mapped[list[dict[str, Any]]] = mapped_column(JSONB)
    search: Mapped[str] = mapped_column(
        TSVECTOR,
        Computed(
            f"setweight(to_tsvector('{SEARCH_CONFIG}', page_title), 'A') || "
            f"setweight(to_tsvector('{SEARCH_CONFIG}', body), 'B')",
            persisted=True,
        ),
    )


class CourseDesignation(Base):
    """A course a page lists under a designation (a GenEd area, writing
    intensive), as published there, independent of Banner attributes."""

    __tablename__ = "course_designation"
    __table_args__ = (
        Index("ix_course_designation_course", "course_id"),
        {"schema": SCHEMA},
    )

    batch_id: Mapped[int] = mapped_column(_fk("import_batch"), primary_key=True)
    designation: Mapped[str] = mapped_column(Text, primary_key=True)
    # "area_course", or "waiver" for courses that waive the area.
    role: Mapped[str] = mapped_column(String(20), primary_key=True)
    # The list item it's printed in: a waiver item names courses that waive
    # the area together ("EDUC 2109, SPED 2231, and TESL 3631").
    item: Mapped[int] = mapped_column(SmallInteger, primary_key=True)
    course_id: Mapped[int] = mapped_column(_fk("course"), primary_key=True)
    source: Mapped[dict[str, Any]] = mapped_column(JSONB)


class QualityIssue(Base):
    """Something extraction, interpretation or validation flagged."""

    __tablename__ = "quality_issue"
    __table_args__ = (
        Index("ix_quality_issue_batch", "batch_id", "code"),
        {"schema": SCHEMA},
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    batch_id: Mapped[int] = mapped_column(_fk("import_batch"))
    stage: Mapped[str] = mapped_column(String(20))
    code: Mapped[str] = mapped_column(Text)
    severity: Mapped[str] = mapped_column(String(10))
    url: Mapped[str] = mapped_column(Text, default="")
    detail: Mapped[str] = mapped_column(Text, default="")
