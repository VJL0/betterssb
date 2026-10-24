"""Load an edition's interpreted records into Postgres as one import batch, and
publish batches.

`import_edition` writes a whole batch in one transaction: either every row of
the edition lands, or none does. A batch whose fingerprint is already stored is
not written again, so re-running an import is a no-op. Loading never changes
what's published; `publish_batch` repoints the edition's release in another
short transaction after the batch's gates pass, and publishing an older batch
is the rollback.

The database URL is always passed explicitly. The ingester never reads the
application's `DATABASE_URL`, so it can't write to a database by accident.
"""

from __future__ import annotations

import json
import logging
from collections.abc import Iterable, Iterator
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

import asyncpg

from app.modules.bulletin.ingest.crawl_state import CrawlState
from app.modules.bulletin.ingest.interpret.output import (
    COURSES_FILE,
    DESIGNATIONS_FILE,
    ISSUES_FILE,
    POLICIES_FILE,
    PROGRAMS_FILE,
    SUMMARY_FILE,
    UNITS_FILE,
    CourseOut,
    DesignationOut,
    InterpretedSummary,
    IssueOut,
    PolicyOut,
    ProgramOut,
    UnitOut,
)
from app.modules.bulletin.ingest.urls import CURRENT_EDITION
from app.modules.bulletin.models import SCHEMA
from app.modules.bulletin.rules import COURSE_CODE, RequirementNode, SourceRef

logger = logging.getLogger(__name__)

ARCHIVE_URL = "https://bulletin.temple.edu/archives/{edition}/"
CURRENT_URL = "https://bulletin.temple.edu/"
# Issues at this severity keep a batch from being published.
BLOCKING_SEVERITY = "error"
REFERENCE_RELATIONS = ("prerequisite", "corequisite")


class PublishRefused(Exception):
    """A batch failed a publication gate; nothing was changed."""


@dataclass(frozen=True, slots=True)
class ImportResult:
    batch_id: int
    created: bool
    counts: dict[str, int]


def _read_jsonl[T: Any](path: Path, model: type[T]) -> list[T]:
    if not path.exists():
        return []
    with path.open() as handle:
        return [model.model_validate_json(line) for line in handle if line.strip()]


def _dump(value: Any) -> str:
    return json.dumps(value, separators=(",", ":"), default=str)


def _source_json(source: SourceRef) -> str:
    return source.model_dump_json(exclude_none=True)


def walk_nodes(
    nodes: Iterable[RequirementNode], parent: str | None = None
) -> Iterator[tuple[RequirementNode, str | None, int]]:
    """Every node with its parent id and position among its siblings."""
    for position, node in enumerate(nodes):
        yield node, parent, position
        yield from walk_nodes(node.children, node.id)


def edition_start_year(edition: str) -> int:
    return int(edition.split("-", 1)[0])


class Loader:
    """One import, on one connection, inside the caller's transaction."""

    def __init__(self, connection: asyncpg.Connection, state: CrawlState) -> None:
        self.connection = connection
        self.state = state
        self.course_ids: dict[str, int] = {}
        self.document_ids: dict[tuple[str, str], int] = {}

    async def _allocate_ids(self, table: str, count: int) -> list[int]:
        if not count:
            return []
        rows = await self.connection.fetch(
            "SELECT nextval(pg_get_serial_sequence($1, 'id')) AS id"
            " FROM generate_series(1, $2)",
            f"{SCHEMA}.{table}",
            count,
        )
        return [row["id"] for row in rows]

    async def _copy(
        self, table: str, columns: list[str], records: list[tuple[Any, ...]]
    ) -> None:
        if records:
            await self.connection.copy_records_to_table(
                table, schema_name=SCHEMA, columns=columns, records=records
            )

    async def ensure_edition(self, edition: str) -> int:
        source_url = (
            CURRENT_URL
            if edition == CURRENT_EDITION
            else ARCHIVE_URL.format(edition=edition)
        )
        return await self.connection.fetchval(
            f"""
            INSERT INTO {SCHEMA}.edition (id, code, start_year, source_url)
            VALUES (
                (SELECT coalesce(max(id), 0) + 1 FROM {SCHEMA}.edition), $1, $2, $3
            )
            ON CONFLICT (code) DO UPDATE SET source_url = excluded.source_url
            RETURNING id
            """,
            edition,
            edition_start_year(edition),
            source_url,
        )

    async def ensure_documents(self, sources: Iterable[tuple[str, str]]) -> None:
        wanted = sorted(set(sources) - self.document_ids.keys())
        rows = []
        for url, sha256 in wanted:
            row = self.state.get(url)
            fetched_at = (
                datetime.fromisoformat(row["fetched_at"])
                if row and row["fetched_at"]
                else None
            )
            rows.append(
                (
                    url,
                    sha256,
                    (row["content_type"] or "") if row else "",
                    fetched_at,
                    (row["status"] or "") if row else "",
                )
            )
        await self.connection.executemany(
            f"""
            INSERT INTO {SCHEMA}.source_document
                (url, sha256, content_type, fetched_at, acquisition)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (url, sha256) DO NOTHING
            """,
            rows,
        )
        for record in await self.connection.fetch(
            f"""
            SELECT d.id, d.url, d.sha256 FROM {SCHEMA}.source_document d
            JOIN unnest($1::text[], $2::text[]) AS w(url, sha256)
              ON d.url = w.url AND d.sha256 = w.sha256
            """,
            [url for url, _ in wanted],
            [sha for _, sha in wanted],
        ):
            self.document_ids[(record["url"], record["sha256"])] = record["id"]

    def document_id(self, source: SourceRef) -> int:
        return self.document_ids[(source.url, source.sha256)]

    async def ensure_courses(self, codes: Iterable[str]) -> None:
        wanted = sorted(set(codes) - self.course_ids.keys())
        malformed = [code for code in wanted if not COURSE_CODE.fullmatch(code)]
        if malformed:
            raise ValueError(f"not course codes: {malformed[:10]}")
        pairs = [code.split(" ", 1) for code in wanted]
        await self.connection.execute(
            f"""
            INSERT INTO {SCHEMA}.course (subject, number)
            SELECT * FROM unnest($1::text[], $2::text[])
            ON CONFLICT (subject, number) DO NOTHING
            """,
            [subject for subject, _ in pairs],
            [number for _, number in pairs],
        )
        for record in await self.connection.fetch(
            f"SELECT id, code FROM {SCHEMA}.course WHERE code = ANY($1::text[])",
            wanted,
        ):
            self.course_ids[record["code"]] = record["id"]

    async def load_courses(self, batch_id: int, courses: list[CourseOut]) -> None:
        version_ids = await self._allocate_ids("course_version", len(courses))
        versions, attributes, requisites, references = [], [], [], []
        requisite_ids = await self._allocate_ids(
            "course_requisite", sum(len(c.requisites) for c in courses)
        )
        next_requisite = iter(requisite_ids)
        for version_id, course in zip(version_ids, courses, strict=True):
            versions.append(
                (
                    version_id,
                    batch_id,
                    self.course_ids[course.code],
                    course.title,
                    course.description,
                    course.credits.text,
                    course.credits.minimum,
                    course.credits.maximum,
                    course.credits.options,
                    course.levels,
                    _dump(
                        [part.model_dump(exclude_none=True) for part in course.parts]
                    ),
                    self.document_id(course.source),
                    _source_json(course.source),
                )
            )
            attributes.extend(
                (version_id, attribute)
                for attribute in dict.fromkeys(course.attributes)
            )
            relations: dict[tuple[str, str], None] = {}
            for requisite in course.requisites:
                requisites.append(
                    (
                        next(next_requisite),
                        version_id,
                        requisite.kind,
                        requisite.source_text,
                        requisite.expression.model_dump_json(exclude_defaults=True)
                        if requisite.expression
                        else None,
                        requisite.interpretation.value,
                        requisite.notes,
                    )
                )
                relations.update(
                    dict.fromkeys((c, requisite.kind) for c in requisite.courses)
                )
            relations.update(dict.fromkeys((c, "mentioned") for c in course.mentioned))
            references.extend(
                (version_id, self.course_ids[code], relation)
                for code, relation in relations
                if code != course.code
            )
        await self._copy(
            "course_version",
            [
                "id",
                "batch_id",
                "course_id",
                "title",
                "description",
                "credits_text",
                "credits_min",
                "credits_max",
                "credit_options",
                "levels",
                "parts",
                "source_document_id",
                "source",
            ],
            versions,
        )
        await self._copy(
            "course_attribute", ["course_version_id", "attribute"], attributes
        )
        await self._copy(
            "course_requisite",
            [
                "id",
                "course_version_id",
                "kind",
                "source_text",
                "expression",
                "interpretation",
                "notes",
            ],
            requisites,
        )
        await self._copy(
            "course_reference",
            ["course_version_id", "referenced_course_id", "relation"],
            references,
        )

    async def load_programs(self, batch_id: int, programs: list[ProgramOut]) -> None:
        paths = [program.path for program in programs]
        await self.connection.execute(
            f"""
            INSERT INTO {SCHEMA}.program (path) SELECT unnest($1::text[])
            ON CONFLICT (path) DO NOTHING
            """,
            paths,
        )
        program_ids = {
            record["path"]: record["id"]
            for record in await self.connection.fetch(
                f"SELECT id, path FROM {SCHEMA}.program WHERE path = ANY($1::text[])",
                paths,
            )
        }
        version_ids = await self._allocate_ids("program_version", len(programs))
        versions, nodes, plans = [], [], []
        for version_id, program in zip(version_ids, programs, strict=True):
            versions.append(
                (
                    version_id,
                    batch_id,
                    program_ids[program.path],
                    program.name,
                    program.level,
                    program.credential,
                    program.award,
                    program.program_code,
                    program.unit_slug,
                    program.campuses,
                    _dump(program.facts),
                    program.requirements.model_dump_json(exclude_defaults=True),
                    program.url,
                    self.document_ids[(program.snapshot_url, program.sha256)],
                )
            )
            tree = program.requirements
            for node, parent, position in walk_nodes([*tree.roots, *tree.prose]):
                nodes.append(
                    (
                        version_id,
                        node.id,
                        parent,
                        position,
                        node.kind,
                        node.label,
                        self.course_ids[node.course] if node.course else None,
                        node.role if parent is None else None,
                        node.min_courses,
                        node.max_courses,
                        node.min_credits,
                        node.max_credits,
                        node.interpretation.value,
                        node.validation.value,
                    )
                )
            plan_ids = await self._allocate_ids("academic_plan", len(program.plans))
            plans.extend(
                (
                    plan_id,
                    version_id,
                    plan.position,
                    plan.label,
                    plan.total_hours,
                    _dump(plan.terms),
                    _dump(plan.footnotes),
                    _source_json(plan.source),
                )
                for plan_id, plan in zip(plan_ids, program.plans, strict=True)
            )
        await self._copy(
            "program_version",
            [
                "id",
                "batch_id",
                "program_id",
                "name",
                "level",
                "credential",
                "award",
                "program_code",
                "unit_slug",
                "campuses",
                "facts",
                "requirements",
                "url",
                "source_document_id",
            ],
            versions,
        )
        await self._copy(
            "requirement_node",
            [
                "program_version_id",
                "node_id",
                "parent_node_id",
                "position",
                "kind",
                "label",
                "course_id",
                "role",
                "min_courses",
                "max_courses",
                "min_credits",
                "max_credits",
                "interpretation",
                "validation",
            ],
            nodes,
        )
        await self._copy(
            "academic_plan",
            [
                "id",
                "program_version_id",
                "position",
                "label",
                "total_hours",
                "terms",
                "footnotes",
                "source",
            ],
            plans,
        )

    async def load_units(self, batch_id: int, units: list[UnitOut]) -> None:
        await self._copy(
            "academic_unit",
            [
                "batch_id",
                "slug",
                "name",
                "parent_slug",
                "kind",
                "level",
                "url",
                "source_document_id",
            ],
            [
                (
                    batch_id,
                    unit.slug,
                    unit.name,
                    unit.parent_slug,
                    unit.kind,
                    unit.level,
                    unit.url,
                    self.document_ids.get((unit.snapshot_url, unit.sha256 or "")),
                )
                for unit in units
            ],
        )

    async def load_policies(self, batch_id: int, policies: list[PolicyOut]) -> None:
        await self._copy(
            "policy_section",
            [
                "batch_id",
                "url",
                "position",
                "page_kind",
                "page_title",
                "headings",
                "tab",
                "topic",
                "body",
                "source_document_id",
                "sources",
            ],
            [
                (
                    batch_id,
                    policy.url,
                    policy.position,
                    policy.page_kind,
                    policy.page_title,
                    policy.headings,
                    policy.tab,
                    policy.topic,
                    policy.body,
                    self.document_ids[(policy.snapshot_url, policy.sha256)],
                    _dump([s.model_dump(exclude_none=True) for s in policy.sources]),
                )
                for policy in policies
            ],
        )

    async def load_designations(
        self, batch_id: int, designations: list[DesignationOut]
    ) -> None:
        unique = {(d.designation, d.role, d.item, d.course): d for d in designations}
        await self._copy(
            "course_designation",
            ["batch_id", "designation", "role", "item", "course_id", "source"],
            [
                (
                    batch_id,
                    d.designation,
                    d.role,
                    d.item,
                    self.course_ids[d.course],
                    _source_json(d.source),
                )
                for d in unique.values()
            ],
        )

    async def load_issues(self, batch_id: int, issues: list[IssueOut]) -> None:
        await self._copy(
            "quality_issue",
            ["batch_id", "stage", "code", "severity", "url", "detail"],
            [(batch_id, i.stage, i.code, i.severity, i.url, i.detail) for i in issues],
        )


@dataclass(slots=True)
class EditionRecords:
    summary: InterpretedSummary
    courses: list[CourseOut]
    programs: list[ProgramOut]
    units: list[UnitOut]
    policies: list[PolicyOut]
    designations: list[DesignationOut]
    issues: list[IssueOut]

    @classmethod
    def read(cls, directory: Path) -> EditionRecords:
        return cls(
            summary=InterpretedSummary.model_validate_json(
                (directory / SUMMARY_FILE).read_text()
            ),
            courses=_read_jsonl(directory / COURSES_FILE, CourseOut),
            programs=_read_jsonl(directory / PROGRAMS_FILE, ProgramOut),
            units=_read_jsonl(directory / UNITS_FILE, UnitOut),
            policies=_read_jsonl(directory / POLICIES_FILE, PolicyOut),
            designations=_read_jsonl(directory / DESIGNATIONS_FILE, DesignationOut),
            issues=_read_jsonl(directory / ISSUES_FILE, IssueOut),
        )

    def source_keys(self) -> set[tuple[str, str]]:
        keys = {(c.source.url, c.source.sha256) for c in self.courses}
        keys |= {(p.snapshot_url, p.sha256) for p in self.programs}
        keys |= {(p.snapshot_url, p.sha256) for p in self.policies}
        keys |= {(u.snapshot_url, u.sha256) for u in self.units if u.sha256}
        return keys

    def course_codes(self) -> set[str]:
        codes = {course.code for course in self.courses}
        for course in self.courses:
            codes.update(course.mentioned)
            for requisite in course.requisites:
                codes.update(requisite.courses)
        for program in self.programs:
            tree = program.requirements
            codes.update(
                node.course
                for node, _, _ in walk_nodes([*tree.roots, *tree.prose])
                if node.course
            )
        codes.update(d.course for d in self.designations)
        return codes


async def import_edition(
    connection: asyncpg.Connection, state: CrawlState, directory: Path
) -> ImportResult:
    records = EditionRecords.read(directory)
    summary = records.summary
    async with connection.transaction():
        loader = Loader(connection, state)
        edition_id = await loader.ensure_edition(summary.edition)
        existing = await connection.fetchrow(
            f"SELECT id, counts FROM {SCHEMA}.import_batch"
            " WHERE edition_id = $1 AND fingerprint = $2",
            edition_id,
            summary.fingerprint,
        )
        if existing:
            return ImportResult(existing["id"], False, json.loads(existing["counts"]))
        batch_id = await connection.fetchval(
            f"""
            INSERT INTO {SCHEMA}.import_batch (
                edition_id, fingerprint, extractor_version, interpreter_version,
                rules_version, status, counts
            ) VALUES ($1, $2, $3, $4, $5, 'staged', $6) RETURNING id
            """,
            edition_id,
            summary.fingerprint,
            summary.extractor_version,
            summary.interpreter_version,
            summary.rules_version,
            _dump(summary.counts),
        )
        await loader.ensure_documents(records.source_keys())
        await loader.ensure_courses(records.course_codes())
        await loader.load_courses(batch_id, records.courses)
        await loader.load_programs(batch_id, records.programs)
        await loader.load_units(batch_id, records.units)
        await loader.load_policies(batch_id, records.policies)
        await loader.load_designations(batch_id, records.designations)
        await loader.load_issues(batch_id, records.issues)
        counts = await batch_counts(connection, batch_id)
        expected = {
            "course_version": len(records.courses),
            "program_version": len(records.programs),
            "policy_section": len(records.policies),
        }
        for table, count in expected.items():
            if counts[table] != count:
                raise RuntimeError(f"{table}: loaded {counts[table]}, expected {count}")
    logger.info("Imported %s as batch %d: %s", summary.edition, batch_id, counts)
    return ImportResult(batch_id, True, counts)


BATCH_TABLES = (
    "course_version",
    "program_version",
    "academic_unit",
    "policy_section",
    "course_designation",
    "quality_issue",
)


async def batch_counts(connection: asyncpg.Connection, batch_id: int) -> dict[str, int]:
    counts = {
        table: await connection.fetchval(
            f"SELECT count(*) FROM {SCHEMA}.{table} WHERE batch_id = $1", batch_id
        )
        for table in BATCH_TABLES
    }
    counts["requirement_node"] = await connection.fetchval(
        f"""
        SELECT count(*) FROM {SCHEMA}.requirement_node n
        JOIN {SCHEMA}.program_version v ON v.id = n.program_version_id
        WHERE v.batch_id = $1
        """,
        batch_id,
    )
    return counts


async def publication_blockers(
    connection: asyncpg.Connection, batch_id: int
) -> list[str]:
    """Reasons the batch can't be published; empty when it can."""
    blockers = []
    counts = await batch_counts(connection, batch_id)
    for table in ("course_version", "program_version"):
        if not counts[table]:
            blockers.append(f"no {table} rows")
    errors = await connection.fetch(
        f"""
        SELECT code, count(*) AS n FROM {SCHEMA}.quality_issue
        WHERE batch_id = $1 AND severity = $2 GROUP BY code ORDER BY code
        """,
        batch_id,
        BLOCKING_SEVERITY,
    )
    blockers.extend(f"{row['n']} {row['code']} errors" for row in errors)
    return blockers


def release_action(batch_id: int, previous: int | None, status: str) -> str:
    """How a release event reads: a first release, or a move back to an older
    batch or forward to a newer one that was released before."""
    if status != "superseded":
        return "publish"
    return "rollback" if previous is not None and batch_id < previous else "republish"


async def publish_batch(
    connection: asyncpg.Connection, batch_id: int, *, dry_run: bool = False
) -> dict[str, Any]:
    async with connection.transaction():
        batch = await connection.fetchrow(
            f"SELECT id, edition_id, status FROM {SCHEMA}.import_batch"
            " WHERE id = $1 FOR UPDATE",
            batch_id,
        )
        if batch is None:
            raise PublishRefused(f"no batch {batch_id}")
        blockers = await publication_blockers(connection, batch_id)
        if blockers:
            raise PublishRefused("; ".join(blockers))
        previous = await connection.fetchval(
            f"SELECT batch_id FROM {SCHEMA}.release WHERE edition_id = $1 FOR UPDATE",
            batch["edition_id"],
        )
        result = {"batch": batch_id, "previous": previous, "dry_run": dry_run}
        if dry_run or previous == batch_id:
            return result
        await connection.execute(
            f"""
            INSERT INTO {SCHEMA}.release (edition_id, batch_id) VALUES ($1, $2)
            ON CONFLICT (edition_id)
            DO UPDATE SET batch_id = excluded.batch_id, published_at = now()
            """,
            batch["edition_id"],
            batch_id,
        )
        await connection.execute(
            f"UPDATE {SCHEMA}.import_batch SET status = 'superseded' WHERE id = $1",
            previous,
        )
        await connection.execute(
            f"UPDATE {SCHEMA}.import_batch SET status = 'published' WHERE id = $1",
            batch_id,
        )
        await connection.execute(
            f"""
            INSERT INTO {SCHEMA}.release_event
                (edition_id, batch_id, previous_batch_id, action)
            VALUES ($1, $2, $3, $4)
            """,
            batch["edition_id"],
            batch_id,
            previous,
            release_action(batch_id, previous, batch["status"]),
        )
    return result


async def prune_batch(connection: asyncpg.Connection, batch_id: int) -> None:
    """Delete a batch's rows, unless an edition publishes it. Identities and
    documents stay. A batch that was ever released keeps its record, marked
    `pruned`, so the release history still resolves; it can't be published
    again (it has no rows), which ends rollback to it."""
    async with connection.transaction():
        published = await connection.fetchval(
            f"SELECT 1 FROM {SCHEMA}.release WHERE batch_id = $1", batch_id
        )
        if published:
            raise PublishRefused(f"batch {batch_id} is published")
        in_history = await connection.fetchval(
            f"""SELECT 1 FROM {SCHEMA}.release_event
            WHERE batch_id = $1 OR previous_batch_id = $1""",
            batch_id,
        )
        for table in ("course_version", "program_version", *BATCH_TABLES[2:]):
            await connection.execute(
                f"DELETE FROM {SCHEMA}.{table} WHERE batch_id = $1", batch_id
            )
        if in_history:
            await connection.execute(
                f"UPDATE {SCHEMA}.import_batch SET status = 'pruned' WHERE id = $1",
                batch_id,
            )
        else:
            await connection.execute(
                f"DELETE FROM {SCHEMA}.import_batch WHERE id = $1", batch_id
            )
