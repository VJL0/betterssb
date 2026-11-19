from __future__ import annotations

from collections.abc import Generator
from contextlib import contextmanager
from typing import Annotated

from fastapi import APIRouter, Body, Depends, HTTPException, Path, Query

from app.core.cache import ONE_DAY_SECONDS, Cache, get_cache
from app.core.errors import upstream_failure_status
from app.core.http_cache import cached_publicly
from app.modules.degree.client import (
    BulletinClient,
    BulletinPageNotFound,
    BulletinUnavailable,
)
from app.modules.degree.parser import BulletinParser
from app.modules.degree.schemas import (
    BulletinProgramIndex,
    BulletinSubjectIndex,
    CourseDescription,
    DegreeProgram,
    SubjectCourses,
)
from app.modules.degree.service import BulletinService

router = APIRouter(prefix="/bulletins", tags=["bulletins"])

UNAVAILABLE = "Temple's Bulletin isn't responding. Try again in a minute."
# A program page on the Bulletin, current ("/undergraduate/…") or archived
# ("/archives/YYYY-YYYY/undergraduate/…"), optionally with a concentration's anchor.
PROGRAM_URL_PATTERN = (
    r"^https://bulletin\.temple\.edu/(archives/\d{4}-\d{4}/)?"
    r"(undergraduate|graduate)(/[a-z0-9_-]+)+(/|/index\.html)?(#[a-z0-9_-]+)?$"
)
SUBJECT_PATTERN = r"^[A-Z]{2,5}$"
COURSE_NUMBER_PATTERN = r"^\d{4}[A-Z]?$"

BulletinYear = Annotated[
    str, Path(pattern=r"^\d{4}-\d{4}$", description="Bulletin year, YYYY-YYYY")
]
SubjectCode = Annotated[
    str, Path(pattern=SUBJECT_PATTERN, description='Subject code, "CIS"')
]

# A stand-in year's answer changes once the year asked for goes online, which the
# API notices within a day (`FALLBACK_TTL_SECONDS`).
BULLETIN_CACHE_SECONDS = ONE_DAY_SECONDS

_parser = BulletinParser()


@contextmanager
def bulletin_errors(not_found: str) -> Generator[None]:
    """A missing Bulletin page answers 404 with `not_found`; an outage, 502 or 504."""
    try:
        yield
    except BulletinPageNotFound as exc:
        raise HTTPException(status_code=404, detail=not_found) from exc
    except BulletinUnavailable as exc:
        raise HTTPException(
            status_code=upstream_failure_status(exc), detail=UNAVAILABLE
        ) from exc


def get_bulletin_service(
    cache: Annotated[Cache | None, Depends(get_cache)],
) -> BulletinService:
    return BulletinService(BulletinClient(), cache)


ServiceDep = Annotated[BulletinService, Depends(get_bulletin_service)]


@router.get(
    "/{year}/programs",
    response_model=BulletinProgramIndex,
    **cached_publicly(BULLETIN_CACHE_SECONDS),
)
async def list_bulletin_programs(
    service: ServiceDep,
    year: BulletinYear,
) -> BulletinProgramIndex:
    """Every program in one year's Bulletin, from its academic programs index."""
    with bulletin_errors(f"The {year} Bulletin isn't on bulletin.temple.edu."):
        return await service.programs(year)


# A program is known by its Bulletin page, whose URL can't be a path segment.
@router.get(
    "/program-requirements",
    response_model=DegreeProgram,
    **cached_publicly(BULLETIN_CACHE_SECONDS),
)
async def get_program_requirements(
    service: ServiceDep,
    url: Annotated[
        str,
        Query(
            pattern=PROGRAM_URL_PATTERN,
            description="A program page URL from `list_bulletin_programs`",
        ),
    ],
) -> DegreeProgram:
    """A program's degree requirements, parsed from its Bulletin page."""
    with bulletin_errors("That program page isn't on the Bulletin."):
        return await service.requirements(url)


@router.get(
    "/{year}/subjects/{subject}/courses/{number}",
    response_model=CourseDescription,
    **cached_publicly(BULLETIN_CACHE_SECONDS),
)
async def get_course_description(
    service: ServiceDep,
    year: BulletinYear,
    subject: SubjectCode,
    number: Annotated[
        str, Path(pattern=COURSE_NUMBER_PATTERN, description='Course number, "3296"')
    ],
) -> CourseDescription:
    """A course's description, credits, attributes, prerequisites and restrictions from one year's Bulletin."""
    code = f"{subject} {number}"
    with bulletin_errors(f"{code} isn't in the {year} Bulletin."):
        return await service.course(code, year)


@router.get(
    "/{year}/subjects",
    response_model=BulletinSubjectIndex,
    **cached_publicly(BULLETIN_CACHE_SECONDS),
)
async def list_bulletin_subjects(
    service: ServiceDep,
    year: BulletinYear,
) -> BulletinSubjectIndex:
    """Every course subject in one year's Bulletin, or the closest earlier year online."""
    with bulletin_errors(f"The {year} Bulletin isn't on bulletin.temple.edu."):
        return await service.subjects(year)


@router.get(
    "/{year}/subjects/{subject}/courses",
    response_model=SubjectCourses,
    **cached_publicly(BULLETIN_CACHE_SECONDS),
)
async def list_subject_courses(
    service: ServiceDep,
    year: BulletinYear,
    subject: SubjectCode,
) -> SubjectCourses:
    """Every course one subject lists in a year's Bulletin, with descriptions and prerequisites."""
    with bulletin_errors(f"{subject} isn't in the {year} Bulletin."):
        return await service.subject_courses(subject, year)


# A custom method (AIP-136): parses a page the caller sends; nothing is stored.
@router.post("/program-requirements:parse", response_model=DegreeProgram)
def parse_bulletin(
    html: str = Body(..., media_type="text/plain"),
    url: str = "",
) -> DegreeProgram:
    """Parse a Temple University Bulletin HTML page into structured degree requirements."""
    return _parser.parse(html, url=url)
