"""The `bulletin` schema: Temple's catalog, one edition per academic year.

Stable identities (a course, a program, a policy) are separate from what one
edition says about them (`*_versions`), so CIS 3296 in 2024-2025 and in
2026-2027 are two versions of one course even when nothing changed. Requirement
and prerequisite logic is a tree of `rule_nodes`, one engine for degrees,
prerequisites and GenEd, with the source wording kept on every node and a
`parse_status` saying how much of it was understood.

These tables use their own metadata, not the app's `Base`, because they need
Postgres (a schema, JSONB, full-text search) and the app's tests run SQLite.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from enum import StrEnum
from typing import Any

from sqlalchemy import (
    CheckConstraint,
    Computed,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    MetaData,
    Numeric,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, TSVECTOR
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

SCHEMA = "bulletin"
CREDITS = Numeric(5, 2)


class BulletinBase(DeclarativeBase):
    metadata = MetaData(schema=SCHEMA)


class SourceFormat(StrEnum):
    HTML = "html"
    PDF = "pdf"


class EditionStatus(StrEnum):
    # Being loaded or failed validation; readers should ignore it.
    STAGING = "staging"
    PUBLISHED = "published"


class ParseStatus(StrEnum):
    # Every part of the source was turned into structure.
    COMPLETE = "complete"
    # Some structure, with source text the parser couldn't interpret.
    PARTIAL = "partial"
    # Kept as source text only.
    RAW = "raw"


class PageKind(StrEnum):
    COURSE_SUBJECT = "course_subject"
    PROGRAM = "program"
    PROGRAM_INDEX = "program_index"
    GENERAL_EDUCATION = "general_education"
    POLICY = "policy"
    ACADEMIC_UNIT = "academic_unit"
    PDF_VOLUME = "pdf_volume"
    OTHER = "other"


class ProgramKind(StrEnum):
    MAJOR = "major"
    MINOR = "minor"
    CERTIFICATE = "certificate"
    CONCENTRATION = "concentration"
    OTHER = "other"


class RuleSetKind(StrEnum):
    PROGRAM_REQUIREMENT = "program_requirement"
    PREREQUISITE = "prerequisite"
    COREQUISITE = "corequisite"
    GENERAL_EDUCATION = "general_education"


class RuleNodeType(StrEnum):
    ALL = "all"
    ANY = "any"
    # Choose `min_count` of the children.
    COUNT = "count"
    # Earn `min_credits`–`max_credits` from the children.
    CREDITS = "credits"
    # A heading that groups rows; the source doesn't say whether all or one apply.
    SECTION = "section"
    COURSE = "course"
    # "any MATH course numbered 0800 to 4999"
    COURSE_RANGE = "course_range"
    ATTRIBUTE = "attribute"
    # "'Y' in MC3": a placement test or Banner attribute flag.
    TEST = "test"
    # Source wording the parser kept but couldn't structure.
    TEXT = "text"


def created_at_column() -> Mapped[datetime]:
    return mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


# ── Editions and sources ────────────────────────────────────────────────────


class Edition(BulletinBase):
    __tablename__ = "editions"

    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True)
    label: Mapped[str] = mapped_column(String(9), unique=True, comment="2024-2025")
    academic_year_start: Mapped[int] = mapped_column(SmallInteger, unique=True)
    source_format: Mapped[str] = mapped_column(String(8))
    status: Mapped[str] = mapped_column(String(16), default=EditionStatus.STAGING)
    # What the source covered, e.g. {"courses": true, "programs": false}.
    coverage: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class CrawlRun(BulletinBase):
    """One load of an edition: where it came from and with which parser."""

    __tablename__ = "crawl_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    edition_id: Mapped[int] = mapped_column(
        ForeignKey("editions.id", ondelete="CASCADE")
    )
    started_at: Mapped[datetime] = created_at_column()
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    source: Mapped[str] = mapped_column(Text, comment="Capture directory or PDF")
    parser_version: Mapped[str] = mapped_column(String(16))
    counts: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)


class SourcePage(BulletinBase):
    __tablename__ = "source_pages"
    __table_args__ = (UniqueConstraint("edition_id", "url"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    edition_id: Mapped[int] = mapped_column(
        ForeignKey("editions.id", ondelete="CASCADE")
    )
    url: Mapped[str] = mapped_column(Text)
    page_kind: Mapped[str] = mapped_column(String(24))
    title: Mapped[str] = mapped_column(Text, default="")


class SourceSnapshot(BulletinBase):
    """A page's fetched bytes, by hash; the bytes live in the raw object store."""

    __tablename__ = "source_snapshots"
    __table_args__ = (UniqueConstraint("page_id", "sha256"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    page_id: Mapped[int] = mapped_column(
        ForeignKey("source_pages.id", ondelete="CASCADE")
    )
    sha256: Mapped[str] = mapped_column(String(64))
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    content_type: Mapped[str] = mapped_column(String(128))
    # Key in the raw object store (data/bulletin/raw locally), not the bytes.
    raw_object_key: Mapped[str] = mapped_column(Text)
    extracted_text: Mapped[str] = mapped_column(Text, default="")


class IngestionIssue(BulletinBase):
    __tablename__ = "ingestion_issues"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    crawl_run_id: Mapped[int] = mapped_column(
        ForeignKey("crawl_runs.id", ondelete="CASCADE"), index=True
    )
    snapshot_id: Mapped[int | None] = mapped_column(
        ForeignKey("source_snapshots.id", ondelete="CASCADE")
    )
    severity: Mapped[str] = mapped_column(String(8), comment="info, warning, error")
    code: Mapped[str] = mapped_column(String(64))
    details: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)


# ── Courses ─────────────────────────────────────────────────────────────────


class Subject(BulletinBase):
    __tablename__ = "subjects"

    code: Mapped[str] = mapped_column(String(8), primary_key=True, comment="CIS")
    name: Mapped[str] = mapped_column(Text, default="")


class Course(BulletinBase):
    """A course's stable identity. Numbers are text: leading zeros and A000."""

    __tablename__ = "courses"
    __table_args__ = (UniqueConstraint("subject_code", "number"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    subject_code: Mapped[str] = mapped_column(ForeignKey("subjects.code"))
    number: Mapped[str] = mapped_column(String(8))


class CourseVersion(BulletinBase):
    __tablename__ = "course_versions"
    __table_args__ = (
        UniqueConstraint("course_id", "edition_id"),
        Index("ix_course_versions_edition", "edition_id"),
        Index("ix_course_versions_search", "search", postgresql_using="gin"),
        CheckConstraint("credits_min <= credits_max"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"))
    edition_id: Mapped[int] = mapped_column(
        ForeignKey("editions.id", ondelete="CASCADE")
    )
    snapshot_id: Mapped[int] = mapped_column(
        ForeignKey("source_snapshots.id", ondelete="CASCADE")
    )
    title: Mapped[str] = mapped_column(Text)
    credits_min: Mapped[Decimal | None] = mapped_column(CREDITS)
    credits_max: Mapped[Decimal | None] = mapped_column(CREDITS)
    credits_text: Mapped[str] = mapped_column(Text, default="")
    description: Mapped[str] = mapped_column(Text, default="")
    prerequisite_text: Mapped[str] = mapped_column(Text, default="")
    corequisite_text: Mapped[str] = mapped_column(Text, default="")
    repeatability_text: Mapped[str] = mapped_column(Text, default="")
    # Every labeled part as printed ({"Course Attributes": "GQ, HO", ...}).
    parts: Mapped[dict[str, str]] = mapped_column(JSONB, default=dict)
    search: Mapped[str] = mapped_column(
        TSVECTOR,
        Computed(
            "setweight(to_tsvector('english', title), 'A') || "
            "setweight(to_tsvector('english', description), 'B')",
            persisted=True,
        ),
    )


class Attribute(BulletinBase):
    """A course attribute code: WI, GA, GQ, HO..."""

    __tablename__ = "attributes"

    code: Mapped[str] = mapped_column(String(16), primary_key=True)
    name: Mapped[str] = mapped_column(Text, default="")


class CourseAttribute(BulletinBase):
    __tablename__ = "course_attributes"
    __table_args__ = (Index("ix_course_attributes_attribute", "attribute_code"),)

    course_version_id: Mapped[int] = mapped_column(
        ForeignKey("course_versions.id", ondelete="CASCADE"), primary_key=True
    )
    attribute_code: Mapped[str] = mapped_column(
        ForeignKey("attributes.code"), primary_key=True
    )


class CourseRestrictionGroup(BulletinBase):
    """One restriction line: "Must be enrolled in one of the following Cohorts"."""

    __tablename__ = "course_restriction_groups"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    course_version_id: Mapped[int] = mapped_column(
        ForeignKey("course_versions.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[str] = mapped_column(String(32), comment="cohort, field_of_study...")
    # include: must be one of the options; exclude: may not be.
    mode: Mapped[str] = mapped_column(String(8))
    source_text: Mapped[str] = mapped_column(Text)


class CourseRestrictionOption(BulletinBase):
    __tablename__ = "course_restriction_options"
    __table_args__ = (Index("ix_course_restriction_options_value", "value"),)

    group_id: Mapped[int] = mapped_column(
        ForeignKey("course_restriction_groups.id", ondelete="CASCADE"),
        primary_key=True,
    )
    position: Mapped[int] = mapped_column(SmallInteger, primary_key=True)
    value: Mapped[str] = mapped_column(Text)


class CourseRelationship(BulletinBase):
    """A course a version's description names, with the sentence naming it.

    `kind` says what the sentence states (duplicate credit, cross-listing) or
    `mentioned` when it's only a reference; it never implies equivalence.
    """

    __tablename__ = "course_relationships"
    __table_args__ = (Index("ix_course_relationships_related", "related_course_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    course_version_id: Mapped[int] = mapped_column(
        ForeignKey("course_versions.id", ondelete="CASCADE"), index=True
    )
    related_course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"))
    kind: Mapped[str] = mapped_column(String(24))
    source_text: Mapped[str] = mapped_column(Text)


# ── Programs ────────────────────────────────────────────────────────────────


class AcademicUnit(BulletinBase):
    """A school or college, by the Bulletin's two-letter code (ST, BU...)."""

    __tablename__ = "academic_units"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(8), unique=True)
    name: Mapped[str] = mapped_column(Text)


class Program(BulletinBase):
    """A major, minor or certificate's identity: its page's URL slug."""

    __tablename__ = "programs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(Text, unique=True, comment="computer-science-bs")
    kind: Mapped[str] = mapped_column(String(16))
    name: Mapped[str] = mapped_column(Text)


class ProgramVersion(BulletinBase):
    __tablename__ = "program_versions"
    __table_args__ = (
        UniqueConstraint("program_id", "edition_id"),
        Index("ix_program_versions_edition", "edition_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    program_id: Mapped[int] = mapped_column(ForeignKey("programs.id"))
    edition_id: Mapped[int] = mapped_column(
        ForeignKey("editions.id", ondelete="CASCADE")
    )
    snapshot_id: Mapped[int] = mapped_column(
        ForeignKey("source_snapshots.id", ondelete="CASCADE")
    )
    academic_unit_id: Mapped[int | None] = mapped_column(
        ForeignKey("academic_units.id")
    )
    name: Mapped[str] = mapped_column(Text)
    degree_type: Mapped[str] = mapped_column(Text, default="", comment="BS, BA")
    program_code: Mapped[str] = mapped_column(String(32), default="")
    overview_text: Mapped[str] = mapped_column(Text, default="")
    # The whole requirements tab as text: prose rules the tables don't hold.
    requirements_text: Mapped[str] = mapped_column(Text, default="")
    total_credits_text: Mapped[str] = mapped_column(Text, default="")
    parse_status: Mapped[str] = mapped_column(String(8))


class PlanTemplate(BulletinBase):
    """A suggested semester-by-semester plan. Advice, not a requirement."""

    __tablename__ = "plan_templates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    program_version_id: Mapped[int] = mapped_column(
        ForeignKey("program_versions.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(Text, default="")
    total_credits_text: Mapped[str] = mapped_column(Text, default="")
    footnotes: Mapped[list[str]] = mapped_column(JSONB, default=list)


class PlanTerm(BulletinBase):
    __tablename__ = "plan_terms"
    __table_args__ = (UniqueConstraint("plan_template_id", "position"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    plan_template_id: Mapped[int] = mapped_column(
        ForeignKey("plan_templates.id", ondelete="CASCADE")
    )
    position: Mapped[int] = mapped_column(SmallInteger)
    year_number: Mapped[int] = mapped_column(SmallInteger)
    term: Mapped[str] = mapped_column(String(16), comment="Fall, Spring, Summer")
    total_credits_text: Mapped[str] = mapped_column(Text, default="")


class PlanItem(BulletinBase):
    __tablename__ = "plan_items"
    __table_args__ = (UniqueConstraint("plan_term_id", "position"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    plan_term_id: Mapped[int] = mapped_column(
        ForeignKey("plan_terms.id", ondelete="CASCADE")
    )
    position: Mapped[int] = mapped_column(SmallInteger)
    # "CIS 1051 or CIS 1951", "GenEd Breadth Course", "Select one of the following:"
    code_text: Mapped[str] = mapped_column(Text)
    title: Mapped[str] = mapped_column(Text, default="")
    credits_text: Mapped[str] = mapped_column(Text, default="")


class PlanItemCourse(BulletinBase):
    """The courses a plan item names; several mean alternatives."""

    __tablename__ = "plan_item_courses"
    __table_args__ = (Index("ix_plan_item_courses_course", "course_id"),)

    plan_item_id: Mapped[int] = mapped_column(
        ForeignKey("plan_items.id", ondelete="CASCADE"), primary_key=True
    )
    position: Mapped[int] = mapped_column(SmallInteger, primary_key=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"))


# ── Rules ───────────────────────────────────────────────────────────────────


class RuleSet(BulletinBase):
    """One requirement tree: a program's table, a prerequisite, a GenEd area."""

    __tablename__ = "rule_sets"
    __table_args__ = (Index("ix_rule_sets_edition_kind", "edition_id", "kind"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    edition_id: Mapped[int] = mapped_column(
        ForeignKey("editions.id", ondelete="CASCADE")
    )
    snapshot_id: Mapped[int] = mapped_column(
        ForeignKey("source_snapshots.id", ondelete="CASCADE")
    )
    kind: Mapped[str] = mapped_column(String(24))
    name: Mapped[str] = mapped_column(Text, default="")
    source_text: Mapped[str] = mapped_column(Text)
    parse_status: Mapped[str] = mapped_column(String(8))


class RuleNode(BulletinBase):
    __tablename__ = "rule_nodes"
    __table_args__ = (
        Index("ix_rule_nodes_rule_set", "rule_set_id"),
        Index("ix_rule_nodes_parent", "parent_id"),
        # Parents are inserted before children, so this keeps every tree acyclic.
        CheckConstraint("parent_id < id", name="parent_before_child"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    rule_set_id: Mapped[int] = mapped_column(
        ForeignKey("rule_sets.id", ondelete="CASCADE")
    )
    parent_id: Mapped[int | None] = mapped_column(
        ForeignKey("rule_nodes.id", ondelete="CASCADE")
    )
    position: Mapped[int] = mapped_column(SmallInteger)
    node_type: Mapped[str] = mapped_column(String(16))
    label: Mapped[str] = mapped_column(Text, default="")
    min_count: Mapped[int | None] = mapped_column(SmallInteger)
    min_credits: Mapped[Decimal | None] = mapped_column(CREDITS)
    max_credits: Mapped[Decimal | None] = mapped_column(CREDITS)
    # Type-specific detail: minimum grade, "may be taken concurrently", a test
    # code and score, a course range, footnote markers.
    params: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    source_text: Mapped[str] = mapped_column(Text, default="")
    parse_status: Mapped[str] = mapped_column(String(8))


class RuleNodeCourse(BulletinBase):
    """Reverse index: which rules name a course."""

    __tablename__ = "rule_node_courses"
    __table_args__ = (Index("ix_rule_node_courses_course", "course_id"),)

    rule_node_id: Mapped[int] = mapped_column(
        ForeignKey("rule_nodes.id", ondelete="CASCADE"), primary_key=True
    )
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"), primary_key=True)


class RuleNodeAttribute(BulletinBase):
    __tablename__ = "rule_node_attributes"
    __table_args__ = (Index("ix_rule_node_attributes_attribute", "attribute_code"),)

    rule_node_id: Mapped[int] = mapped_column(
        ForeignKey("rule_nodes.id", ondelete="CASCADE"), primary_key=True
    )
    attribute_code: Mapped[str] = mapped_column(
        ForeignKey("attributes.code"), primary_key=True
    )


class ProgramRuleSet(BulletinBase):
    __tablename__ = "program_rule_sets"

    program_version_id: Mapped[int] = mapped_column(
        ForeignKey("program_versions.id", ondelete="CASCADE"), primary_key=True
    )
    rule_set_id: Mapped[int] = mapped_column(
        ForeignKey("rule_sets.id", ondelete="CASCADE"), primary_key=True
    )
    position: Mapped[int] = mapped_column(SmallInteger)


class CourseRuleSet(BulletinBase):
    __tablename__ = "course_rule_sets"

    course_version_id: Mapped[int] = mapped_column(
        ForeignKey("course_versions.id", ondelete="CASCADE"), primary_key=True
    )
    rule_set_id: Mapped[int] = mapped_column(
        ForeignKey("rule_sets.id", ondelete="CASCADE"), primary_key=True
    )


# ── Policies ────────────────────────────────────────────────────────────────


class Policy(BulletinBase):
    __tablename__ = "policies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(Text, unique=True, comment="repeating-course")
    title: Mapped[str] = mapped_column(Text)


class PolicyVersion(BulletinBase):
    """A policy's text as one edition printed it. Not executable logic."""

    __tablename__ = "policy_versions"
    __table_args__ = (
        UniqueConstraint("policy_id", "edition_id"),
        Index("ix_policy_versions_search", "search", postgresql_using="gin"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    policy_id: Mapped[int] = mapped_column(ForeignKey("policies.id"))
    edition_id: Mapped[int] = mapped_column(
        ForeignKey("editions.id", ondelete="CASCADE")
    )
    snapshot_id: Mapped[int] = mapped_column(
        ForeignKey("source_snapshots.id", ondelete="CASCADE")
    )
    title: Mapped[str] = mapped_column(Text)
    policy_number: Mapped[str] = mapped_column(String(32), default="")
    body_text: Mapped[str] = mapped_column(Text)
    search: Mapped[str] = mapped_column(
        TSVECTOR,
        Computed(
            "setweight(to_tsvector('english', title), 'A') || "
            "setweight(to_tsvector('english', body_text), 'B')",
            persisted=True,
        ),
    )
