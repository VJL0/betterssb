"""Temple's published Bulletin, by edition: courses, programs with their
requirement trees, policies and academic units.

Read-only, from the `bulletin` schema. Nothing here fetches Temple's site or
calls a model; the data comes from the offline ingester's published releases.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Query

from app.api.deps import DbDep
from app.modules.bulletin import schemas
from app.modules.bulletin.repository import (
    BulletinRepository,
    CourseFilters,
    ProgramFilters,
)

router = APIRouter(prefix="/bulletin", tags=["bulletin"])

MAX_PAGE_SIZE = 100
DEFAULT_PAGE_SIZE = 25

EditionPath = Annotated[
    str, Path(pattern=r"^\d{4}-\d{4}$", description="Bulletin year, e.g. 2026-2027")
]
SubjectPath = Annotated[str, Path(pattern=r"^[A-Za-z]{2,5}$")]
NumberPath = Annotated[str, Path(pattern=r"^[0-9A-Za-z]{4,5}$")]
QueryText = Annotated[str, Query(max_length=100)]
Limit = Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)]
Offset = Annotated[int, Query(ge=0)]


def get_repository(session: DbDep) -> BulletinRepository:
    return BulletinRepository(session)


RepositoryDep = Annotated[BulletinRepository, Depends(get_repository)]


def _found[T](value: T | None, what: str) -> T:
    if value is None:
        raise HTTPException(status_code=404, detail=f"No such {what} in this edition.")
    return value


@router.get("/editions", response_model=list[schemas.EditionSummary])
async def list_editions(repository: RepositoryDep) -> list[schemas.EditionSummary]:
    """Published Bulletin editions, newest first."""
    return await repository.editions()


@router.get("/{edition}/courses", response_model=list[schemas.CourseSummary])
async def search_courses(
    repository: RepositoryDep,
    edition: EditionPath,
    q: QueryText = "",
    subject: Annotated[str | None, Query(pattern=r"^[A-Za-z]{2,5}$")] = None,
    attribute: Annotated[str | None, Query(max_length=10)] = None,
    level: Annotated[str | None, Query(pattern=r"^(undergraduate|graduate)$")] = None,
    min_credits: Annotated[Decimal | None, Query(ge=0)] = None,
    max_credits: Annotated[Decimal | None, Query(ge=0)] = None,
    limit: Limit = DEFAULT_PAGE_SIZE,
    offset: Offset = 0,
) -> list[schemas.CourseSummary]:
    """Courses by code, title or description, with optional filters."""
    filters = CourseFilters(q, subject, attribute, level, min_credits, max_credits)
    return await repository.search_courses(edition, filters, limit, offset)


@router.get(
    "/{edition}/courses/{subject}/{number}", response_model=schemas.CourseDetail
)
async def get_course(
    repository: RepositoryDep,
    edition: EditionPath,
    subject: SubjectPath,
    number: NumberPath,
) -> schemas.CourseDetail:
    """A course as the edition lists it, with its requisites, the courses that
    require it and the programs that name it."""
    return _found(await repository.course(edition, subject, number), "course")


@router.get(
    "/courses/{subject}/{number}/editions",
    response_model=list[schemas.CourseEdition],
)
async def get_course_history(
    repository: RepositoryDep, subject: SubjectPath, number: NumberPath
) -> list[schemas.CourseEdition]:
    """The course code in every published edition that lists it."""
    return await repository.course_history(subject, number)


@router.get("/{edition}/programs", response_model=list[schemas.ProgramSummary])
async def search_programs(
    repository: RepositoryDep,
    edition: EditionPath,
    q: QueryText = "",
    level: Annotated[
        str | None, Query(pattern=r"^(undergraduate|graduate|professional)$")
    ] = None,
    credential: Annotated[str | None, Query(max_length=40)] = None,
    unit: Annotated[str | None, Query(max_length=80)] = None,
    limit: Limit = DEFAULT_PAGE_SIZE,
    offset: Offset = 0,
) -> list[schemas.ProgramSummary]:
    """Majors, minors, certificates and graduate and professional programs."""
    filters = ProgramFilters(q, level, credential, unit)
    return await repository.search_programs(edition, filters, limit, offset)


@router.get("/{edition}/programs/{program_id}", response_model=schemas.ProgramDetail)
async def get_program(
    repository: RepositoryDep, edition: EditionPath, program_id: int
) -> schemas.ProgramDetail:
    """A program's requirement tree, with sources, and its suggested plans."""
    return _found(await repository.program(edition, program_id), "program")


@router.get(
    "/programs/{program_id}/editions", response_model=list[schemas.ProgramEdition]
)
async def get_program_history(
    repository: RepositoryDep, program_id: int
) -> list[schemas.ProgramEdition]:
    """The published editions that include the program."""
    return await repository.program_history(program_id)


@router.get("/{edition}/policies", response_model=list[schemas.PolicySection])
async def search_policies(
    repository: RepositoryDep,
    edition: EditionPath,
    q: QueryText = "",
    topic: Annotated[str | None, Query(max_length=30)] = None,
    limit: Limit = DEFAULT_PAGE_SIZE,
    offset: Offset = 0,
) -> list[schemas.PolicySection]:
    """Policy, General Education and college sections, verbatim."""
    return await repository.policies(edition, q, topic, limit, offset)


@router.get("/{edition}/units", response_model=list[schemas.AcademicUnit])
async def list_units(
    repository: RepositoryDep, edition: EditionPath
) -> list[schemas.AcademicUnit]:
    """Schools, colleges and departments the edition names."""
    return await repository.units(edition)
