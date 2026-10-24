"""Writes one parsed edition into the `bulletin` schema.

A load replaces the edition in one transaction: its previous rows are deleted,
the new ones inserted with status `staging`, consistency checks run, and only
then is it marked `published`. A failed check rolls the whole load back, so
readers never see a partial edition. Stable identities (courses, programs,
policies) outlive editions and are only ever added to.

Rows are buffered and inserted in batches with ids drawn from each table's
sequence up front, so a parent's id is known before its children are written
and rule nodes get ids in tree order (which `parent_before_child` relies on).
"""

from __future__ import annotations

import re
from collections import defaultdict
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import Table, delete, func, insert, select, text, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncConnection

from app.modules.bulletin.editions import academic_year_start
from app.modules.bulletin.ingest.courses import CourseDraft
from app.modules.bulletin.ingest.pages import GenEdDraft, PolicyDraft
from app.modules.bulletin.ingest.programs import PlanDraft, ProgramListing, ProgramPage
from app.modules.bulletin.ingest.rules import RuleNodeDraft
from app.modules.bulletin.models import (
    SCHEMA,
    AcademicUnit,
    Attribute,
    Course,
    CourseAttribute,
    CourseRelationship,
    CourseRestrictionGroup,
    CourseRestrictionOption,
    CourseRuleSet,
    CourseVersion,
    CrawlRun,
    Edition,
    EditionStatus,
    IngestionIssue,
    PlanItem,
    PlanItemCourse,
    PlanTemplate,
    PlanTerm,
    Policy,
    PolicyVersion,
    Program,
    ProgramKind,
    ProgramRuleSet,
    ProgramVersion,
    RuleNode,
    RuleNodeAttribute,
    RuleNodeCourse,
    RuleSet,
    RuleSetKind,
    SourcePage,
    SourceSnapshot,
    Subject,
)

PARSER_VERSION = "1.0.0"

# Insert order: every table after the tables its foreign keys point to.
FLUSH_ORDER: list[Table] = [
    model.__table__
    for model in (
        SourcePage,
        SourceSnapshot,
        CourseVersion,
        CourseAttribute,
        CourseRestrictionGroup,
        CourseRestrictionOption,
        CourseRelationship,
        ProgramVersion,
        PlanTemplate,
        PlanTerm,
        PlanItem,
        PlanItemCourse,
        RuleSet,
        RuleNode,
        RuleNodeCourse,
        RuleNodeAttribute,
        ProgramRuleSet,
        CourseRuleSet,
        PolicyVersion,
        IngestionIssue,
    )
]

# Each query counts rows that break an invariant the schema can't express.
CONSISTENCY_CHECKS = {
    "program rule set from another edition": """
        SELECT count(*) FROM bulletin.program_rule_sets prs
        JOIN bulletin.program_versions pv ON pv.id = prs.program_version_id
        JOIN bulletin.rule_sets rs ON rs.id = prs.rule_set_id
        WHERE pv.edition_id <> rs.edition_id AND pv.edition_id = :edition_id
    """,
    "course rule set from another edition": """
        SELECT count(*) FROM bulletin.course_rule_sets crs
        JOIN bulletin.course_versions cv ON cv.id = crs.course_version_id
        JOIN bulletin.rule_sets rs ON rs.id = crs.rule_set_id
        WHERE cv.edition_id <> rs.edition_id AND cv.edition_id = :edition_id
    """,
    "rule node under a parent in another rule set": """
        SELECT count(*) FROM bulletin.rule_nodes child
        JOIN bulletin.rule_nodes parent ON parent.id = child.parent_id
        JOIN bulletin.rule_sets rs ON rs.id = child.rule_set_id
        WHERE child.rule_set_id <> parent.rule_set_id AND rs.edition_id = :edition_id
    """,
    "rule set without exactly one root": """
        SELECT count(*) FROM bulletin.rule_sets rs
        WHERE rs.edition_id = :edition_id AND (
            SELECT count(*) FROM bulletin.rule_nodes n
            WHERE n.rule_set_id = rs.id AND n.parent_id IS NULL
        ) <> 1
    """,
}


class ConsistencyError(RuntimeError):
    pass


def slugify(title: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")


def _normalized_title(title: str) -> str:
    return re.sub(r"[^a-z0-9]", "", title.lower())


class EditionLoader:
    def __init__(self, connection: AsyncConnection, label: str) -> None:
        self.connection = connection
        self.label = label
        self.edition_id = 0
        self.crawl_run_id = 0
        self.pending: dict[Table, list[dict[str, Any]]] = defaultdict(list)
        self.course_ids: dict[tuple[str, str], int] = {}
        self.subjects: set[str] = set()
        self.attributes: set[str] = set()
        self.unit_ids: dict[str, int] = {}
        self.counts: dict[str, int] = defaultdict(int)

    # ── Lifecycle ───────────────────────────────────────────────────────────

    async def begin(self, source_format: str, source: str) -> None:
        await self.connection.execute(
            delete(Edition).where(Edition.label == self.label)
        )
        self.edition_id = await self.connection.scalar(
            insert(Edition)
            .values(
                label=self.label,
                academic_year_start=academic_year_start(self.label),
                source_format=source_format,
                status=EditionStatus.STAGING,
                coverage={},
            )
            .returning(Edition.id)
        )
        self.crawl_run_id = await self.connection.scalar(
            insert(CrawlRun)
            .values(
                edition_id=self.edition_id,
                source=source,
                parser_version=PARSER_VERSION,
                counts={},
            )
            .returning(CrawlRun.id)
        )
        rows = await self.connection.execute(
            select(Course.id, Course.subject_code, Course.number)
        )
        self.course_ids = {(subject, number): id_ for id_, subject, number in rows}
        self.subjects = set(await self.connection.scalars(select(Subject.code)))
        self.attributes = set(await self.connection.scalars(select(Attribute.code)))

    async def publish(self, coverage: dict[str, Any]) -> dict[str, int]:
        await self.flush()
        for problem, query in CONSISTENCY_CHECKS.items():
            broken = await self.connection.scalar(
                text(query), {"edition_id": self.edition_id}
            )
            if broken:
                raise ConsistencyError(f"{broken} × {problem}")
        if not self.counts["course_versions"]:
            raise ConsistencyError("The edition has no courses")
        now = datetime.now(UTC)
        await self.connection.execute(
            update(Edition)
            .where(Edition.id == self.edition_id)
            .values(
                status=EditionStatus.PUBLISHED,
                published_at=now,
                coverage={**coverage, **self.counts},
            )
        )
        await self.connection.execute(
            update(CrawlRun)
            .where(CrawlRun.id == self.crawl_run_id)
            .values(finished_at=now, counts=dict(self.counts))
        )
        return dict(self.counts)

    # ── Buffered inserts ────────────────────────────────────────────────────

    async def allocate_ids(self, table: Table, count: int) -> list[int]:
        if count == 0:
            return []
        rows = await self.connection.scalars(
            text(
                "SELECT nextval(pg_get_serial_sequence(:table, 'id')) "
                "FROM generate_series(1, :count)"
            ),
            {"table": f"{SCHEMA}.{table.name}", "count": count},
        )
        return sorted(rows)

    async def allocate_id(self, table: Table) -> int:
        return (await self.allocate_ids(table, 1))[0]

    def queue(self, table: Table, **row: Any) -> None:
        self.pending[table].append(row)
        self.counts[table.name] += 1

    async def flush(self) -> None:
        for table in FLUSH_ORDER:
            if rows := self.pending.pop(table, None):
                await self.connection.execute(insert(table), rows)

    # ── Identities ──────────────────────────────────────────────────────────

    async def ensure_subject(self, code: str, name: str = "") -> None:
        if code in self.subjects and not name:
            return
        statement = pg_insert(Subject).values(code=code, name=name)
        await self.connection.execute(
            statement.on_conflict_do_update(
                index_elements=[Subject.code],
                set_={"name": statement.excluded.name},
                where=statement.excluded.name != "",
            )
        )
        self.subjects.add(code)

    async def course_id(self, subject: str, number: str) -> int:
        key = (subject, number)
        if key not in self.course_ids:
            await self.ensure_subject(subject)
            self.course_ids[key] = await self.connection.scalar(
                insert(Course)
                .values(subject_code=subject, number=number)
                .returning(Course.id)
            )
        return self.course_ids[key]

    async def ensure_attribute(self, code: str, name: str = "") -> None:
        if code in self.attributes and not name:
            return
        statement = pg_insert(Attribute).values(code=code, name=name)
        await self.connection.execute(
            statement.on_conflict_do_update(
                index_elements=[Attribute.code],
                set_={"name": statement.excluded.name},
                where=statement.excluded.name != "",
            )
        )
        self.attributes.add(code)

    async def unit_id(self, code: str, name: str) -> int:
        if code not in self.unit_ids:
            statement = pg_insert(AcademicUnit).values(code=code, name=name)
            self.unit_ids[code] = await self.connection.scalar(
                statement.on_conflict_do_update(
                    index_elements=[AcademicUnit.code],
                    set_={"name": statement.excluded.name},
                ).returning(AcademicUnit.id)
            )
        return self.unit_ids[code]

    async def program_id(self, slug: str, kind: ProgramKind, name: str) -> int:
        statement = pg_insert(Program).values(slug=slug, kind=kind, name=name)
        return await self.connection.scalar(
            statement.on_conflict_do_update(
                index_elements=[Program.slug],
                set_={"kind": statement.excluded.kind, "name": statement.excluded.name},
            ).returning(Program.id)
        )

    async def policy_id(self, slug: str, title: str) -> int:
        """Match a policy by slug, else by title, so PDF and HTML editions share one."""
        existing = await self.connection.execute(
            select(Policy.id, Policy.slug, Policy.title)
        )
        wanted = _normalized_title(title)
        for id_, existing_slug, existing_title in existing:
            if existing_slug == slug or _normalized_title(existing_title) == wanted:
                return id_
        return await self.connection.scalar(
            insert(Policy).values(slug=slug, title=title).returning(Policy.id)
        )

    # ── Sources ─────────────────────────────────────────────────────────────

    async def add_snapshot(
        self,
        *,
        url: str,
        page_kind: str,
        title: str,
        sha256: str,
        fetched_at: datetime,
        content_type: str,
        raw_object_key: str,
        extracted_text: str,
    ) -> int:
        page_id = await self.allocate_id(SourcePage.__table__)
        snapshot_id = await self.allocate_id(SourceSnapshot.__table__)
        self.queue(
            SourcePage.__table__,
            id=page_id,
            edition_id=self.edition_id,
            url=url,
            page_kind=page_kind,
            title=title,
        )
        self.queue(
            SourceSnapshot.__table__,
            id=snapshot_id,
            page_id=page_id,
            sha256=sha256,
            fetched_at=fetched_at,
            content_type=content_type,
            raw_object_key=raw_object_key,
            extracted_text=extracted_text,
        )
        return snapshot_id

    def add_issue(
        self, code: str, severity: str, snapshot_id: int | None = None, **details: Any
    ) -> None:
        self.queue(
            IngestionIssue.__table__,
            crawl_run_id=self.crawl_run_id,
            snapshot_id=snapshot_id,
            severity=severity,
            code=code,
            details=details,
        )

    # ── Rule trees ──────────────────────────────────────────────────────────

    async def add_rule_set(
        self,
        snapshot_id: int,
        kind: RuleSetKind,
        name: str,
        source_text: str,
        tree: RuleNodeDraft,
    ) -> int:
        rule_set_id = await self.allocate_id(RuleSet.__table__)
        self.queue(
            RuleSet.__table__,
            id=rule_set_id,
            edition_id=self.edition_id,
            snapshot_id=snapshot_id,
            kind=kind,
            name=name,
            source_text=source_text,
            parse_status=tree.tree_status(),
        )
        nodes = list(tree.walk())
        node_ids = dict(
            zip(
                map(id, nodes),
                await self.allocate_ids(RuleNode.__table__, len(nodes)),
                strict=True,
            )
        )
        await self._queue_node(tree, None, 0, rule_set_id, node_ids)
        return rule_set_id

    async def _queue_node(
        self,
        node: RuleNodeDraft,
        parent_id: int | None,
        position: int,
        rule_set_id: int,
        node_ids: dict[int, int],
    ) -> None:
        node_id = node_ids[id(node)]
        self.queue(
            RuleNode.__table__,
            id=node_id,
            rule_set_id=rule_set_id,
            parent_id=parent_id,
            position=position,
            node_type=node.node_type,
            label=node.label,
            min_count=node.min_count,
            min_credits=node.min_credits,
            max_credits=node.max_credits,
            params=node.params,
            source_text=node.source_text,
            parse_status=node.parse_status,
        )
        if node.course:
            course_id = await self.course_id(*node.course)
            self.queue(
                RuleNodeCourse.__table__, rule_node_id=node_id, course_id=course_id
            )
        if node.attribute:
            await self.ensure_attribute(node.attribute)
            self.queue(
                RuleNodeAttribute.__table__,
                rule_node_id=node_id,
                attribute_code=node.attribute,
            )
        for child_position, child in enumerate(node.children):
            await self._queue_node(
                child, node_id, child_position, rule_set_id, node_ids
            )

    # ── Courses ─────────────────────────────────────────────────────────────

    async def add_courses(
        self,
        snapshot_id: int,
        subject_code: str,
        subject_name: str,
        courses: list[CourseDraft],
    ) -> None:
        if subject_code:
            await self.ensure_subject(subject_code, subject_name)
        version_ids = await self.allocate_ids(CourseVersion.__table__, len(courses))
        for version_id, course in zip(version_ids, courses, strict=True):
            await self._add_course(snapshot_id, version_id, course)
        await self.flush()

    async def _add_course(
        self, snapshot_id: int, version_id: int, course: CourseDraft
    ) -> None:
        self.queue(
            CourseVersion.__table__,
            id=version_id,
            course_id=await self.course_id(course.subject, course.number),
            edition_id=self.edition_id,
            snapshot_id=snapshot_id,
            title=course.title,
            credits_min=course.credits_min,
            credits_max=course.credits_max,
            credits_text=course.credits_text,
            description=course.description,
            prerequisite_text=course.parts.get("Pre-requisites", ""),
            corequisite_text=course.parts.get("Co-requisites", ""),
            repeatability_text=course.parts.get("Repeatability", ""),
            parts=course.parts,
        )
        for code in dict.fromkeys(course.attributes):
            await self.ensure_attribute(code)
            self.queue(
                CourseAttribute.__table__,
                course_version_id=version_id,
                attribute_code=code,
            )
        group_ids = await self.allocate_ids(
            CourseRestrictionGroup.__table__, len(course.restrictions)
        )
        for group_id, restriction in zip(group_ids, course.restrictions, strict=True):
            self.queue(
                CourseRestrictionGroup.__table__,
                id=group_id,
                course_version_id=version_id,
                kind=restriction.kind,
                mode=restriction.mode,
                source_text=restriction.source_text,
            )
            for position, value in enumerate(restriction.values):
                self.queue(
                    CourseRestrictionOption.__table__,
                    group_id=group_id,
                    position=position,
                    value=value,
                )
        for relationship in course.relationships:
            self.queue(
                CourseRelationship.__table__,
                course_version_id=version_id,
                related_course_id=await self.course_id(
                    relationship.subject, relationship.number
                ),
                kind=relationship.kind,
                source_text=relationship.source_text,
            )
        for kind, tree, source_text in (
            (
                RuleSetKind.PREREQUISITE,
                course.prerequisites,
                course.parts.get("Pre-requisites"),
            ),
            (
                RuleSetKind.COREQUISITE,
                course.corequisites,
                course.parts.get("Co-requisites"),
            ),
        ):
            if tree is None or source_text is None:
                continue
            rule_set_id = await self.add_rule_set(
                snapshot_id, kind, f"{course.code} {kind.value}", source_text, tree
            )
            self.queue(
                CourseRuleSet.__table__,
                course_version_id=version_id,
                rule_set_id=rule_set_id,
            )

    # ── Programs ────────────────────────────────────────────────────────────

    async def add_program(
        self,
        snapshot_id: int,
        slug: str,
        listing: ProgramListing,
        page: ProgramPage,
        unit_names: dict[str, str],
    ) -> None:
        unit_id = None
        if listing.unit_code:
            unit_id = await self.unit_id(
                listing.unit_code, unit_names.get(listing.unit_code, listing.unit_code)
            )
        name = page.name or listing.name
        version_id = await self.allocate_id(ProgramVersion.__table__)
        self.queue(
            ProgramVersion.__table__,
            id=version_id,
            program_id=await self.program_id(slug, listing.kind, name),
            edition_id=self.edition_id,
            snapshot_id=snapshot_id,
            academic_unit_id=unit_id,
            name=name,
            degree_type=listing.label if listing.kind is ProgramKind.MAJOR else "",
            program_code=page.program_code,
            overview_text=page.overview_text,
            requirements_text=page.requirements_text,
            total_credits_text=next(
                (
                    table.tree.params["total_credits_text"]
                    for table in page.requirement_tables
                    if "total_credits_text" in table.tree.params
                ),
                "",
            ),
            parse_status=page.parse_status,
        )
        for position, table in enumerate(page.requirement_tables):
            rule_set_id = await self.add_rule_set(
                snapshot_id,
                RuleSetKind.PROGRAM_REQUIREMENT,
                table.name,
                table.source_text,
                table.tree,
            )
            self.queue(
                ProgramRuleSet.__table__,
                program_version_id=version_id,
                rule_set_id=rule_set_id,
                position=position,
            )
        for plan in page.plans:
            await self._add_plan(version_id, plan)
        await self.flush()

    async def _add_plan(self, program_version_id: int, plan: PlanDraft) -> None:
        template_id = await self.allocate_id(PlanTemplate.__table__)
        self.queue(
            PlanTemplate.__table__,
            id=template_id,
            program_version_id=program_version_id,
            name=plan.name,
            total_credits_text=plan.total_credits_text,
            footnotes=plan.footnotes,
        )
        term_ids = await self.allocate_ids(PlanTerm.__table__, len(plan.terms))
        for position, (term_id, term) in enumerate(
            zip(term_ids, plan.terms, strict=True)
        ):
            self.queue(
                PlanTerm.__table__,
                id=term_id,
                plan_template_id=template_id,
                position=position,
                year_number=term.year_number,
                term=term.term,
                total_credits_text=term.total_credits_text,
            )
            item_ids = await self.allocate_ids(PlanItem.__table__, len(term.items))
            for item_position, (item_id, item) in enumerate(
                zip(item_ids, term.items, strict=True)
            ):
                self.queue(
                    PlanItem.__table__,
                    id=item_id,
                    plan_term_id=term_id,
                    position=item_position,
                    code_text=item.code_text,
                    title=item.title,
                    credits_text=item.credits_text,
                )
                for course_position, (subject, number) in enumerate(
                    dict.fromkeys(item.courses)
                ):
                    self.queue(
                        PlanItemCourse.__table__,
                        plan_item_id=item_id,
                        position=course_position,
                        course_id=await self.course_id(subject, number),
                    )

    # ── GenEd and policies ──────────────────────────────────────────────────

    async def add_gened(self, snapshot_id: int, gened: GenEdDraft) -> None:
        for code in gened.codes:
            await self.ensure_attribute(code, gened.title)
        await self.add_rule_set(
            snapshot_id,
            RuleSetKind.GENERAL_EDUCATION,
            gened.title,
            gened.tree.source_text,
            gened.tree,
        )
        await self.flush()

    async def add_policy(
        self, snapshot_id: int, slug: str, policy: PolicyDraft
    ) -> None:
        self.queue(
            PolicyVersion.__table__,
            policy_id=await self.policy_id(slug, policy.title),
            edition_id=self.edition_id,
            snapshot_id=snapshot_id,
            title=policy.title,
            policy_number=policy.policy_number,
            body_text=policy.body_text,
        )


async def edition_counts(connection: AsyncConnection) -> list[tuple[str, str, int]]:
    rows = await connection.execute(
        select(Edition.label, Edition.status, func.count(CourseVersion.id))
        .outerjoin(CourseVersion, CourseVersion.edition_id == Edition.id)
        .group_by(Edition.label, Edition.status)
        .order_by(Edition.label)
    )
    return [tuple(row) for row in rows]
