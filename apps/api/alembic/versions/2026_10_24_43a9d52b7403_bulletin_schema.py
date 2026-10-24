"""bulletin schema

The Bulletin's versioned academic data in its own `bulletin` schema; see
`app/modules/bulletin/models.py`. Trigram search needs `pg_trgm`, which Neon
and stock PostgreSQL ship; the extension is left installed on downgrade since
other schemas may use it.

Revision ID: 43a9d52b7403
Revises: 788a4e5d9c47
Create Date: 2026-10-24 18:19:17.129570

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "43a9d52b7403"
down_revision: str | Sequence[str] | None = "788a4e5d9c47"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.execute("CREATE SCHEMA IF NOT EXISTS bulletin")
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.create_table(
        "course",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("subject", sa.String(length=5), nullable=False),
        sa.Column("number", sa.String(length=5), nullable=False),
        sa.Column(
            "code",
            sa.String(length=11),
            sa.Computed("subject || ' ' || number", persisted=True),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("subject", "number"),
        schema="bulletin",
    )
    op.create_table(
        "edition",
        sa.Column("id", sa.SmallInteger(), nullable=False),
        sa.Column("code", sa.String(length=9), nullable=False),
        sa.Column("start_year", sa.SmallInteger(), nullable=False),
        sa.Column("source_url", sa.Text(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code"),
        schema="bulletin",
    )
    op.create_table(
        "program",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("path", sa.Text(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("path"),
        schema="bulletin",
    )
    op.create_table(
        "source_document",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        sa.Column("content_type", sa.Text(), nullable=False),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("acquisition", sa.String(length=40), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("url", "sha256"),
        schema="bulletin",
    )
    op.create_table(
        "import_batch",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("edition_id", sa.SmallInteger(), nullable=False),
        sa.Column("fingerprint", sa.String(length=64), nullable=False),
        sa.Column("extractor_version", sa.String(length=20), nullable=False),
        sa.Column("interpreter_version", sa.String(length=20), nullable=False),
        sa.Column("rules_version", sa.String(length=20), nullable=False),
        sa.Column("status", sa.String(length=12), nullable=False),
        sa.Column("counts", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "status IN ('staged', 'published', 'superseded', 'pruned')",
            name="batch_status",
        ),
        sa.ForeignKeyConstraint(
            ["edition_id"], ["bulletin.edition.id"], ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("edition_id", "fingerprint"),
        schema="bulletin",
    )
    op.create_table(
        "academic_unit",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("batch_id", sa.Integer(), nullable=False),
        sa.Column("slug", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("parent_slug", sa.Text(), nullable=True),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("level", sa.String(length=20), nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("source_document_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(
            ["batch_id"], ["bulletin.import_batch.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["source_document_id"], ["bulletin.source_document.id"], ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("batch_id", "slug"),
        schema="bulletin",
    )
    op.create_table(
        "course_designation",
        sa.Column("batch_id", sa.Integer(), nullable=False),
        sa.Column("designation", sa.Text(), nullable=False),
        sa.Column("role", sa.String(length=20), nullable=False),
        sa.Column("item", sa.SmallInteger(), nullable=False),
        sa.Column("course_id", sa.Integer(), nullable=False),
        sa.Column("source", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.ForeignKeyConstraint(
            ["batch_id"], ["bulletin.import_batch.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["course_id"], ["bulletin.course.id"], ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("batch_id", "designation", "role", "item", "course_id"),
        schema="bulletin",
    )
    op.create_index(
        "ix_course_designation_course",
        "course_designation",
        ["course_id"],
        unique=False,
        schema="bulletin",
    )
    op.create_table(
        "course_version",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("batch_id", sa.Integer(), nullable=False),
        sa.Column("course_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("credits_text", sa.Text(), nullable=False),
        sa.Column("credits_min", sa.Numeric(precision=5, scale=2), nullable=False),
        sa.Column("credits_max", sa.Numeric(precision=5, scale=2), nullable=False),
        sa.Column(
            "credit_options",
            postgresql.ARRAY(sa.Numeric(precision=5, scale=2)),
            nullable=False,
        ),
        sa.Column("levels", postgresql.ARRAY(sa.Text()), nullable=False),
        sa.Column("parts", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("source_document_id", sa.Integer(), nullable=False),
        sa.Column("source", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "search",
            postgresql.TSVECTOR(),
            sa.Computed(
                "setweight(to_tsvector('english', title), 'A') || setweight(to_tsvector('english', description), 'B')",
                persisted=True,
            ),
            nullable=False,
        ),
        sa.CheckConstraint("credits_min <= credits_max", name="credit_range"),
        sa.ForeignKeyConstraint(
            ["batch_id"], ["bulletin.import_batch.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["course_id"], ["bulletin.course.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["source_document_id"], ["bulletin.source_document.id"], ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("batch_id", "course_id"),
        schema="bulletin",
    )
    op.create_index(
        "ix_course_version_course",
        "course_version",
        ["course_id"],
        unique=False,
        schema="bulletin",
    )
    op.create_index(
        "ix_course_version_search",
        "course_version",
        ["search"],
        unique=False,
        schema="bulletin",
        postgresql_using="gin",
    )
    op.create_index(
        "ix_course_version_title_trgm",
        "course_version",
        ["title"],
        unique=False,
        schema="bulletin",
        postgresql_using="gin",
        postgresql_ops={"title": "gin_trgm_ops"},
    )
    op.create_table(
        "policy_section",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("batch_id", sa.Integer(), nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("page_kind", sa.String(length=20), nullable=False),
        sa.Column("page_title", sa.Text(), nullable=False),
        sa.Column("headings", postgresql.ARRAY(sa.Text()), nullable=False),
        sa.Column("tab", sa.Text(), nullable=True),
        sa.Column("topic", sa.String(length=30), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("source_document_id", sa.Integer(), nullable=False),
        sa.Column("sources", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "search",
            postgresql.TSVECTOR(),
            sa.Computed(
                "setweight(to_tsvector('english', page_title), 'A') || setweight(to_tsvector('english', body), 'B')",
                persisted=True,
            ),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["batch_id"], ["bulletin.import_batch.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["source_document_id"], ["bulletin.source_document.id"], ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("batch_id", "url", "position"),
        schema="bulletin",
    )
    op.create_index(
        "ix_policy_section_search",
        "policy_section",
        ["search"],
        unique=False,
        schema="bulletin",
        postgresql_using="gin",
    )
    op.create_index(
        "ix_policy_section_topic",
        "policy_section",
        ["batch_id", "topic"],
        unique=False,
        schema="bulletin",
    )
    op.create_table(
        "program_version",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("batch_id", sa.Integer(), nullable=False),
        sa.Column("program_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("level", sa.String(length=20), nullable=False),
        sa.Column("credential", sa.Text(), nullable=False),
        sa.Column("award", sa.Text(), nullable=False),
        sa.Column("program_code", sa.Text(), nullable=True),
        sa.Column("unit_slug", sa.Text(), nullable=True),
        sa.Column("campuses", postgresql.ARRAY(sa.Text()), nullable=False),
        sa.Column("facts", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "requirements", postgresql.JSONB(astext_type=sa.Text()), nullable=False
        ),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("source_document_id", sa.Integer(), nullable=False),
        sa.Column(
            "search",
            postgresql.TSVECTOR(),
            sa.Computed("to_tsvector('english', name)", persisted=True),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["batch_id"], ["bulletin.import_batch.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["program_id"], ["bulletin.program.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["source_document_id"], ["bulletin.source_document.id"], ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("batch_id", "program_id"),
        schema="bulletin",
    )
    op.create_index(
        "ix_program_version_name_trgm",
        "program_version",
        ["name"],
        unique=False,
        schema="bulletin",
        postgresql_using="gin",
        postgresql_ops={"name": "gin_trgm_ops"},
    )
    op.create_index(
        "ix_program_version_program",
        "program_version",
        ["program_id"],
        unique=False,
        schema="bulletin",
    )
    op.create_index(
        "ix_program_version_search",
        "program_version",
        ["search"],
        unique=False,
        schema="bulletin",
        postgresql_using="gin",
    )
    op.create_index(
        "ix_program_version_unit",
        "program_version",
        ["batch_id", "unit_slug"],
        unique=False,
        schema="bulletin",
    )
    op.create_table(
        "quality_issue",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("batch_id", sa.Integer(), nullable=False),
        sa.Column("stage", sa.String(length=20), nullable=False),
        sa.Column("code", sa.Text(), nullable=False),
        sa.Column("severity", sa.String(length=10), nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("detail", sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(
            ["batch_id"], ["bulletin.import_batch.id"], ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id"),
        schema="bulletin",
    )
    op.create_index(
        "ix_quality_issue_batch",
        "quality_issue",
        ["batch_id", "code"],
        unique=False,
        schema="bulletin",
    )
    op.create_table(
        "release",
        sa.Column("edition_id", sa.SmallInteger(), nullable=False),
        sa.Column("batch_id", sa.Integer(), nullable=False),
        sa.Column(
            "published_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["batch_id"], ["bulletin.import_batch.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["edition_id"], ["bulletin.edition.id"], ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("edition_id"),
        sa.UniqueConstraint("batch_id"),
        schema="bulletin",
    )
    op.create_table(
        "release_event",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("edition_id", sa.SmallInteger(), nullable=False),
        sa.Column("batch_id", sa.Integer(), nullable=False),
        sa.Column("previous_batch_id", sa.Integer(), nullable=True),
        sa.Column("action", sa.String(length=12), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["batch_id"], ["bulletin.import_batch.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["edition_id"], ["bulletin.edition.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["previous_batch_id"], ["bulletin.import_batch.id"], ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id"),
        schema="bulletin",
    )
    op.create_table(
        "academic_plan",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("program_version_id", sa.Integer(), nullable=False),
        sa.Column("position", sa.SmallInteger(), nullable=False),
        sa.Column("label", sa.Text(), nullable=False),
        sa.Column("total_hours", sa.Text(), nullable=False),
        sa.Column("terms", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("footnotes", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("source", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.ForeignKeyConstraint(
            ["program_version_id"], ["bulletin.program_version.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("program_version_id", "position"),
        schema="bulletin",
    )
    op.create_table(
        "course_attribute",
        sa.Column("course_version_id", sa.Integer(), nullable=False),
        sa.Column("attribute", sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(
            ["course_version_id"], ["bulletin.course_version.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("course_version_id", "attribute"),
        schema="bulletin",
    )
    op.create_index(
        "ix_course_attribute_attribute",
        "course_attribute",
        ["attribute"],
        unique=False,
        schema="bulletin",
    )
    op.create_table(
        "course_reference",
        sa.Column("course_version_id", sa.Integer(), nullable=False),
        sa.Column("referenced_course_id", sa.Integer(), nullable=False),
        sa.Column("relation", sa.String(length=14), nullable=False),
        sa.ForeignKeyConstraint(
            ["course_version_id"], ["bulletin.course_version.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["referenced_course_id"], ["bulletin.course.id"], ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint(
            "course_version_id", "referenced_course_id", "relation"
        ),
        schema="bulletin",
    )
    op.create_index(
        "ix_course_reference_referenced",
        "course_reference",
        ["referenced_course_id"],
        unique=False,
        schema="bulletin",
    )
    op.create_table(
        "course_requisite",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("course_version_id", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(length=14), nullable=False),
        sa.Column("source_text", sa.Text(), nullable=False),
        sa.Column("expression", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("interpretation", sa.String(length=14), nullable=False),
        sa.Column("notes", postgresql.ARRAY(sa.Text()), nullable=False),
        sa.ForeignKeyConstraint(
            ["course_version_id"], ["bulletin.course_version.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("course_version_id", "kind"),
        schema="bulletin",
    )
    op.create_table(
        "requirement_node",
        sa.Column("program_version_id", sa.Integer(), nullable=False),
        sa.Column("node_id", sa.Text(), nullable=False),
        sa.Column("parent_node_id", sa.Text(), nullable=True),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(length=14), nullable=False),
        sa.Column("label", sa.Text(), nullable=False),
        sa.Column("course_id", sa.Integer(), nullable=True),
        sa.Column("role", sa.String(length=20), nullable=True),
        sa.Column("min_courses", sa.Integer(), nullable=True),
        sa.Column("max_courses", sa.Integer(), nullable=True),
        sa.Column("min_credits", sa.Numeric(precision=6, scale=2), nullable=True),
        sa.Column("max_credits", sa.Numeric(precision=6, scale=2), nullable=True),
        sa.Column("interpretation", sa.String(length=14), nullable=False),
        sa.Column("validation", sa.String(length=22), nullable=False),
        sa.ForeignKeyConstraint(
            ["course_id"], ["bulletin.course.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["program_version_id"], ["bulletin.program_version.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("program_version_id", "node_id"),
        schema="bulletin",
    )
    op.create_index(
        "ix_requirement_node_course",
        "requirement_node",
        ["course_id"],
        unique=False,
        schema="bulletin",
    )
    op.create_index(
        "ix_requirement_node_interpretation",
        "requirement_node",
        ["interpretation"],
        unique=False,
        schema="bulletin",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(
        "ix_requirement_node_interpretation",
        table_name="requirement_node",
        schema="bulletin",
    )
    op.drop_index(
        "ix_requirement_node_course", table_name="requirement_node", schema="bulletin"
    )
    op.drop_table("requirement_node", schema="bulletin")
    op.drop_table("course_requisite", schema="bulletin")
    op.drop_index(
        "ix_course_reference_referenced",
        table_name="course_reference",
        schema="bulletin",
    )
    op.drop_table("course_reference", schema="bulletin")
    op.drop_index(
        "ix_course_attribute_attribute",
        table_name="course_attribute",
        schema="bulletin",
    )
    op.drop_table("course_attribute", schema="bulletin")
    op.drop_table("academic_plan", schema="bulletin")
    op.drop_table("release_event", schema="bulletin")
    op.drop_table("release", schema="bulletin")
    op.drop_index(
        "ix_quality_issue_batch", table_name="quality_issue", schema="bulletin"
    )
    op.drop_table("quality_issue", schema="bulletin")
    op.drop_index(
        "ix_program_version_unit", table_name="program_version", schema="bulletin"
    )
    op.drop_index(
        "ix_program_version_search",
        table_name="program_version",
        schema="bulletin",
        postgresql_using="gin",
    )
    op.drop_index(
        "ix_program_version_program", table_name="program_version", schema="bulletin"
    )
    op.drop_index(
        "ix_program_version_name_trgm",
        table_name="program_version",
        schema="bulletin",
        postgresql_using="gin",
        postgresql_ops={"name": "gin_trgm_ops"},
    )
    op.drop_table("program_version", schema="bulletin")
    op.drop_index(
        "ix_policy_section_topic", table_name="policy_section", schema="bulletin"
    )
    op.drop_index(
        "ix_policy_section_search",
        table_name="policy_section",
        schema="bulletin",
        postgresql_using="gin",
    )
    op.drop_table("policy_section", schema="bulletin")
    op.drop_index(
        "ix_course_version_title_trgm",
        table_name="course_version",
        schema="bulletin",
        postgresql_using="gin",
        postgresql_ops={"title": "gin_trgm_ops"},
    )
    op.drop_index(
        "ix_course_version_search",
        table_name="course_version",
        schema="bulletin",
        postgresql_using="gin",
    )
    op.drop_index(
        "ix_course_version_course", table_name="course_version", schema="bulletin"
    )
    op.drop_table("course_version", schema="bulletin")
    op.drop_index(
        "ix_course_designation_course",
        table_name="course_designation",
        schema="bulletin",
    )
    op.drop_table("course_designation", schema="bulletin")
    op.drop_table("academic_unit", schema="bulletin")
    op.drop_table("import_batch", schema="bulletin")
    op.drop_table("source_document", schema="bulletin")
    op.drop_table("program", schema="bulletin")
    op.drop_table("edition", schema="bulletin")
    op.drop_table("course", schema="bulletin")
    op.execute("DROP SCHEMA bulletin")
