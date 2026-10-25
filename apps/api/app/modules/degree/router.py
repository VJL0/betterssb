from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Body, Depends, HTTPException, Query

from app.core.cache import Cache, get_cache
from app.modules.degree.client import (
    BulletinClient,
    BulletinPageNotFound,
    BulletinUnavailable,
)
from app.modules.degree.parser import BulletinParser
from app.modules.degree.schemas import (
    BulletinProgramIndex,
    CourseDescription,
    DegreeProgram,
)
from app.modules.degree.service import BulletinService

router = APIRouter(prefix="/degree", tags=["degree"])

UNAVAILABLE = "Temple's Bulletin isn't responding. Try again in a minute."
# A program page on the Bulletin, current ("/undergraduate/…") or archived
# ("/archives/YYYY-YYYY/undergraduate/…"), optionally with a concentration's anchor.
PROGRAM_URL_PATTERN = (
    r"^https://bulletin\.temple\.edu/(archives/\d{4}-\d{4}/)?"
    r"(undergraduate|graduate)(/[a-z0-9_-]+)+(/|/index\.html)?(#[a-z0-9_-]+)?$"
)
BULLETIN_YEAR_PATTERN = r"^\d{4}-\d{4}$"
COURSE_CODE_PATTERN = r"^[A-Z]{2,5} \d{4}[A-Z]?$"

_parser = BulletinParser()


def get_bulletin_service(
    cache: Annotated[Cache | None, Depends(get_cache)],
) -> BulletinService:
    return BulletinService(BulletinClient(), cache)


ServiceDep = Annotated[BulletinService, Depends(get_bulletin_service)]


@router.get("/programs", response_model=BulletinProgramIndex)
async def list_bulletin_programs(
    service: ServiceDep,
    year: Annotated[
        str,
        Query(pattern=BULLETIN_YEAR_PATTERN, description="Bulletin year, YYYY-YYYY"),
    ],
) -> BulletinProgramIndex:
    """Every program in one year's Bulletin, from its academic programs index."""
    try:
        return await service.programs(year)
    except BulletinPageNotFound as exc:
        raise HTTPException(
            status_code=404,
            detail=f"The {year} Bulletin isn't on bulletin.temple.edu.",
        ) from exc
    except BulletinUnavailable as exc:
        raise HTTPException(status_code=502, detail=UNAVAILABLE) from exc


@router.get("/requirements", response_model=DegreeProgram)
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
    try:
        return await service.requirements(url)
    except BulletinPageNotFound as exc:
        raise HTTPException(
            status_code=404, detail="That program page isn't on the Bulletin."
        ) from exc
    except BulletinUnavailable as exc:
        raise HTTPException(status_code=502, detail=UNAVAILABLE) from exc


@router.get("/courses", response_model=CourseDescription)
async def get_course_description(
    service: ServiceDep,
    code: Annotated[
        str, Query(pattern=COURSE_CODE_PATTERN, description='Course code, "CIS 3296"')
    ],
    year: Annotated[
        str,
        Query(pattern=BULLETIN_YEAR_PATTERN, description="Bulletin year, YYYY-YYYY"),
    ],
) -> CourseDescription:
    """A course's description, credits, attributes, prerequisites and restrictions from one year's Bulletin."""
    try:
        return await service.course(code, year)
    except BulletinPageNotFound as exc:
        raise HTTPException(
            status_code=404, detail=f"{code} isn't in the {year} Bulletin."
        ) from exc
    except BulletinUnavailable as exc:
        raise HTTPException(status_code=502, detail=UNAVAILABLE) from exc


@router.post("/parse-bulletin", response_model=DegreeProgram)
def parse_bulletin(
    html: str = Body(..., media_type="text/plain"),
    url: str = "",
) -> DegreeProgram:
    """Parse a Temple University Bulletin HTML page into structured degree requirements."""
    return _parser.parse(html, url=url)
