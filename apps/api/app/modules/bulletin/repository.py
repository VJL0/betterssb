"""Read-only queries over published Bulletin editions.

Every query goes through `release`, so only published batches are visible and
an import in progress never is. Search uses Postgres full-text search (ranked
by `ts_rank`) and falls back to trigram similarity on titles, so "data struct"
and "datastructures" both find Data Structures.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from decimal import Decimal

from sqlalchemy import Select, and_, func, literal_column, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.bulletin import schemas
from app.modules.bulletin.models import (
    SEARCH_CONFIG,
    AcademicPlan,
    AcademicUnit,
    Course,
    CourseAttribute,
    CourseReference,
    CourseRequisite,
    CourseVersion,
    Edition,
    PolicySection,
    Program,
    ProgramVersion,
    Release,
    RequirementNodeRow,
)
from app.modules.bulletin.rules import RequirementTree, RequisiteExpression, SourceRef

# Below this, a trigram match is noise ("cis" matches half the catalog).
TRIGRAM_THRESHOLD = 0.3
REQUISITE_RELATIONS = ("prerequisite", "corequisite")


@dataclass(frozen=True, slots=True)
class CourseFilters:
    query: str = ""
    subject: str | None = None
    attribute: str | None = None
    level: str | None = None
    min_credits: Decimal | None = None
    max_credits: Decimal | None = None


@dataclass(frozen=True, slots=True)
class ProgramFilters:
    query: str = ""
    level: str | None = None
    credential: str | None = None
    unit: str | None = None


def _published_batch(edition: str) -> Select[tuple[int]]:
    return (
        select(Release.batch_id)
        .join(Edition, Edition.id == Release.edition_id)
        .where(Edition.code == edition)
    )


def _text_match(search_column, text_column, query: str):
    ts_query = func.websearch_to_tsquery(SEARCH_CONFIG, query)
    return (
        or_(
            search_column.op("@@")(ts_query),
            func.similarity(text_column, query) > TRIGRAM_THRESHOLD,
        ),
        func.ts_rank(search_column, ts_query) + func.similarity(text_column, query),
    )


def _attributes(version_id) -> Select:
    return (
        select(
            func.coalesce(
                func.array_agg(CourseAttribute.attribute), literal_column("'{}'")
            )
        )
        .where(CourseAttribute.course_version_id == version_id)
        .scalar_subquery()
    )


def _course_summary(row) -> schemas.CourseSummary:
    return schemas.CourseSummary(
        code=row.code,
        subject=row.subject,
        number=row.number,
        title=row.title,
        credits=row.credits_text,
        credits_min=row.credits_min,
        credits_max=row.credits_max,
        levels=row.levels,
        attributes=sorted(row.attributes),
    )


class BulletinRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def editions(self) -> list[schemas.EditionSummary]:
        courses = (
            select(func.count())
            .where(CourseVersion.batch_id == Release.batch_id)
            .scalar_subquery()
        )
        programs = (
            select(func.count())
            .where(ProgramVersion.batch_id == Release.batch_id)
            .scalar_subquery()
        )
        rows = await self.session.execute(
            select(
                Edition.code,
                Edition.source_url,
                Release.published_at,
                courses,
                programs,
            )
            .join(Release, Release.edition_id == Edition.id)
            .order_by(Edition.start_year.desc())
        )
        return [
            schemas.EditionSummary(
                code=code,
                source_url=url,
                published_at=published_at,
                courses=course_count,
                programs=program_count,
            )
            for code, url, published_at, course_count, program_count in rows
        ]

    def _course_rows(self, edition: str) -> Select:
        return (
            select(
                CourseVersion.id,
                Course.code,
                Course.subject,
                Course.number,
                CourseVersion.title,
                CourseVersion.credits_text,
                CourseVersion.credits_min,
                CourseVersion.credits_max,
                CourseVersion.levels,
                _attributes(CourseVersion.id).label("attributes"),
            )
            .join(Course, Course.id == CourseVersion.course_id)
            .where(
                CourseVersion.batch_id == _published_batch(edition).scalar_subquery()
            )
        )

    async def search_courses(
        self, edition: str, filters: CourseFilters, limit: int, offset: int
    ) -> list[schemas.CourseSummary]:
        statement = self._course_rows(edition)
        order = [Course.subject, Course.number]
        if filters.query:
            code = filters.query.upper().replace(" ", "")
            match, rank = _text_match(
                CourseVersion.search, CourseVersion.title, filters.query
            )
            statement = statement.where(
                or_(match, func.replace(Course.code, " ", "").startswith(code))
            )
            order = [rank.desc(), *order]
        if filters.subject:
            statement = statement.where(Course.subject == filters.subject.upper())
        if filters.attribute:
            statement = statement.where(
                select(CourseAttribute.attribute)
                .where(
                    CourseAttribute.course_version_id == CourseVersion.id,
                    CourseAttribute.attribute == filters.attribute,
                )
                .exists()
            )
        if filters.level:
            statement = statement.where(CourseVersion.levels.any(filters.level))
        if filters.min_credits is not None:
            statement = statement.where(
                CourseVersion.credits_max >= filters.min_credits
            )
        if filters.max_credits is not None:
            statement = statement.where(
                CourseVersion.credits_min <= filters.max_credits
            )
        rows = await self.session.execute(
            statement.order_by(*order).limit(limit).offset(offset)
        )
        return [_course_summary(row) for row in rows]

    async def course(
        self, edition: str, subject: str, number: str
    ) -> schemas.CourseDetail | None:
        row = (
            await self.session.execute(
                self._course_rows(edition)
                .add_columns(
                    CourseVersion.description,
                    CourseVersion.credit_options,
                    CourseVersion.parts,
                    CourseVersion.source,
                    CourseVersion.course_id,
                    CourseVersion.batch_id,
                )
                .where(
                    Course.subject == subject.upper(), Course.number == number.upper()
                )
            )
        ).one_or_none()
        if row is None:
            return None
        requisites = (
            await self.session.scalars(
                select(CourseRequisite)
                .where(CourseRequisite.course_version_id == row.id)
                .order_by(CourseRequisite.kind.desc())
            )
        ).all()
        summary = _course_summary(row)
        return schemas.CourseDetail(
            **summary.model_dump(),
            edition=edition,
            description=row.description,
            credit_options=row.credit_options,
            parts=[
                schemas.CoursePart(label=p["label"], text=p["text"]) for p in row.parts
            ],
            requisites=[
                schemas.CourseRequisite(
                    kind=requisite.kind,
                    text=requisite.source_text,
                    expression=RequisiteExpression.model_validate(requisite.expression)
                    if requisite.expression
                    else None,
                    interpretation=requisite.interpretation,
                    notes=requisite.notes,
                )
                for requisite in requisites
            ],
            required_by=await self._required_by(row.batch_id, row.course_id),
            programs=await self._programs_using(row.batch_id, row.course_id),
            source=SourceRef.model_validate(row.source),
        )

    async def _required_by(self, batch_id: int, course_id: int) -> list[str]:
        rows = await self.session.scalars(
            select(Course.code)
            .distinct()
            .join(CourseVersion, CourseVersion.course_id == Course.id)
            .join(
                CourseReference, CourseReference.course_version_id == CourseVersion.id
            )
            .where(
                CourseVersion.batch_id == batch_id,
                CourseReference.referenced_course_id == course_id,
                CourseReference.relation.in_(REQUISITE_RELATIONS),
            )
            .order_by(Course.code)
        )
        return list(rows)

    async def _programs_using(
        self, batch_id: int, course_id: int
    ) -> list[schemas.ProgramReference]:
        rows = await self.session.execute(
            select(
                ProgramVersion.program_id,
                ProgramVersion.name,
                ProgramVersion.level,
                ProgramVersion.credential,
                ProgramVersion.award,
            )
            .distinct()
            .join(
                RequirementNodeRow,
                RequirementNodeRow.program_version_id == ProgramVersion.id,
            )
            .where(
                ProgramVersion.batch_id == batch_id,
                RequirementNodeRow.course_id == course_id,
            )
            .order_by(ProgramVersion.name)
        )
        return [
            schemas.ProgramReference(
                id=program_id,
                name=name,
                level=level,
                credential=credential,
                award=award,
            )
            for program_id, name, level, credential, award in rows
        ]

    async def course_history(
        self, subject: str, number: str
    ) -> list[schemas.CourseEdition]:
        rows = await self.session.execute(
            select(
                Edition.code,
                CourseVersion.title,
                CourseVersion.credits_text,
                CourseVersion.description,
            )
            .join(Release, Release.edition_id == Edition.id)
            .join(CourseVersion, CourseVersion.batch_id == Release.batch_id)
            .join(Course, Course.id == CourseVersion.course_id)
            .where(Course.subject == subject.upper(), Course.number == number.upper())
            .order_by(Edition.start_year.desc())
        )
        return [
            schemas.CourseEdition(
                edition=code, title=title, credits=credits, description=d
            )
            for code, title, credits, d in rows
        ]

    def _program_rows(self, edition: str) -> Select:
        return select(
            ProgramVersion.id.label("version_id"),
            ProgramVersion.program_id,
            ProgramVersion.name,
            ProgramVersion.level,
            ProgramVersion.credential,
            ProgramVersion.award,
            ProgramVersion.program_code,
            ProgramVersion.unit_slug,
            ProgramVersion.campuses,
        ).where(ProgramVersion.batch_id == _published_batch(edition).scalar_subquery())

    @staticmethod
    def _program_summary(row) -> schemas.ProgramSummary:
        return schemas.ProgramSummary(
            id=row.program_id,
            name=row.name,
            level=row.level,
            credential=row.credential,
            award=row.award,
            program_code=row.program_code,
            unit=row.unit_slug,
            campuses=row.campuses,
        )

    async def search_programs(
        self, edition: str, filters: ProgramFilters, limit: int, offset: int
    ) -> list[schemas.ProgramSummary]:
        statement = self._program_rows(edition)
        order = [ProgramVersion.name]
        if filters.query:
            match, rank = _text_match(
                ProgramVersion.search, ProgramVersion.name, filters.query
            )
            statement = statement.where(match)
            order = [rank.desc(), *order]
        conditions = {
            ProgramVersion.level: filters.level,
            ProgramVersion.credential: filters.credential,
            ProgramVersion.unit_slug: filters.unit,
        }
        statement = statement.where(
            and_(*(column == value for column, value in conditions.items() if value))
        )
        rows = await self.session.execute(
            statement.order_by(*order).limit(limit).offset(offset)
        )
        return [self._program_summary(row) for row in rows]

    async def program(
        self, edition: str, program_id: int
    ) -> schemas.ProgramDetail | None:
        row = (
            await self.session.execute(
                self._program_rows(edition)
                .add_columns(
                    ProgramVersion.url,
                    ProgramVersion.facts,
                    ProgramVersion.requirements,
                )
                .where(ProgramVersion.program_id == program_id)
            )
        ).one_or_none()
        if row is None:
            return None
        plans = (
            await self.session.scalars(
                select(AcademicPlan)
                .where(AcademicPlan.program_version_id == row.version_id)
                .order_by(AcademicPlan.position)
            )
        ).all()
        return schemas.ProgramDetail(
            **self._program_summary(row).model_dump(),
            edition=edition,
            url=row.url,
            facts=row.facts,
            requirements=RequirementTree.model_validate(row.requirements),
            plans=[
                schemas.AcademicPlan(
                    label=plan.label,
                    total_hours=plan.total_hours,
                    terms=plan.terms,
                    footnotes=plan.footnotes,
                )
                for plan in plans
            ],
        )

    async def program_history(self, program_id: int) -> list[schemas.ProgramEdition]:
        rows = await self.session.execute(
            select(Edition.code, ProgramVersion.name, ProgramVersion.url)
            .join(Release, Release.edition_id == Edition.id)
            .join(ProgramVersion, ProgramVersion.batch_id == Release.batch_id)
            .join(Program, Program.id == ProgramVersion.program_id)
            .where(Program.id == program_id)
            .order_by(Edition.start_year.desc())
        )
        return [
            schemas.ProgramEdition(edition=code, name=name, url=url)
            for code, name, url in rows
        ]

    async def policies(
        self, edition: str, query: str, topic: str | None, limit: int, offset: int
    ) -> list[schemas.PolicySection]:
        statement = select(PolicySection).where(
            PolicySection.batch_id == _published_batch(edition).scalar_subquery()
        )
        order: Sequence = [PolicySection.url, PolicySection.position]
        if query:
            ts_query = func.websearch_to_tsquery(SEARCH_CONFIG, query)
            statement = statement.where(PolicySection.search.op("@@")(ts_query))
            order = [func.ts_rank(PolicySection.search, ts_query).desc(), *order]
        if topic:
            statement = statement.where(PolicySection.topic == topic)
        sections = await self.session.scalars(
            statement.order_by(*order).limit(limit).offset(offset)
        )
        return [
            schemas.PolicySection(
                url=section.url,
                page_title=section.page_title,
                headings=section.headings,
                topic=section.topic,
                body=section.body,
                sources=[SourceRef.model_validate(s) for s in section.sources],
            )
            for section in sections
        ]

    async def units(self, edition: str) -> list[schemas.AcademicUnit]:
        units = await self.session.scalars(
            select(AcademicUnit)
            .where(AcademicUnit.batch_id == _published_batch(edition).scalar_subquery())
            .order_by(AcademicUnit.name)
        )
        return [
            schemas.AcademicUnit(
                slug=unit.slug,
                name=unit.name,
                parent_slug=unit.parent_slug,
                kind=unit.kind,
                level=unit.level,
                url=unit.url,
            )
            for unit in units
        ]
