from __future__ import annotations

from collections.abc import Generator
from contextlib import contextmanager
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from pydantic import StringConstraints

from app.core.cache import Cache, get_cache
from app.modules.classes.client import (
    TEMPLE_SSB_BASE_URL,
    BannerClassSearchClient,
    ClassSearchUnavailable,
    SearchFilters,
)
from app.modules.classes.schemas import (
    ClassSearchResult,
    CodeDescription,
    SectionSummary,
)
from app.modules.classes.section_client import (
    BannerSectionClient,
    SectionNotFound,
    SectionUnavailable,
)
from app.modules.classes.service import ClassSearchService

router = APIRouter(prefix="/classes", tags=["classes"])

MAX_PAGE_SIZE = 100
DEFAULT_PAGE_SIZE = 50
UNAVAILABLE = "Banner's class search isn't responding. Try again in a minute."

TermQuery = Annotated[str, Query(pattern=r"^\d{6}$", description="Banner term code")]
BannerCode = Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9]{1,6}$")]
CourseNumberEnd = Annotated[str | None, Query(pattern=r"^\d{1,4}$")]
CrnPath = Annotated[
    str, Path(pattern=r"^\d{4,5}$", description="Four- or five-digit CRN")
]
MAX_CODES = 20


@contextmanager
def banner_errors(not_found: str = "") -> Generator[None]:
    """Banner not answering becomes a 502, and a missing CRN a 404 with `not_found`."""
    try:
        yield
    except SectionNotFound as exc:
        raise HTTPException(status_code=404, detail=not_found) from exc
    except (ClassSearchUnavailable, SectionUnavailable) as exc:
        raise HTTPException(status_code=502, detail=UNAVAILABLE) from exc


def get_class_search_service(
    cache: Annotated[Cache | None, Depends(get_cache)],
) -> ClassSearchService:
    return ClassSearchService(
        BannerClassSearchClient(TEMPLE_SSB_BASE_URL),
        BannerSectionClient(TEMPLE_SSB_BASE_URL),
        cache,
    )


ServiceDep = Annotated[ClassSearchService, Depends(get_class_search_service)]


@router.get("/terms", response_model=list[CodeDescription])
async def list_terms(service: ServiceDep) -> list[CodeDescription]:
    """Terms with a published class schedule, newest first."""
    with banner_errors():
        return await service.terms()


@router.get("/subjects", response_model=list[CodeDescription])
async def list_subjects(
    service: ServiceDep,
    term: TermQuery,
    q: Annotated[str, Query(max_length=40)] = "",
) -> list[CodeDescription]:
    """Subjects offered in a term, optionally filtered by code or name."""
    with banner_errors():
        return await service.subjects(term, q)


@router.get("/attributes", response_model=list[CodeDescription])
async def list_attributes(
    service: ServiceDep, term: TermQuery
) -> list[CodeDescription]:
    """Section attributes for a term, such as GenEd areas and Writing Intensive."""
    with banner_errors():
        return await service.attributes(term)


@router.get("/campuses", response_model=list[CodeDescription])
async def list_campuses(service: ServiceDep, term: TermQuery) -> list[CodeDescription]:
    """Campuses with sections in a term, such as Main, Center City and Japan."""
    with banner_errors():
        return await service.campuses(term)


@router.get("/parts-of-term", response_model=list[CodeDescription])
async def list_parts_of_term(
    service: ServiceDep, term: TermQuery
) -> list[CodeDescription]:
    """Parts of a term, such as the full term and the 7-week halves, with their dates."""
    with banner_errors():
        return await service.parts_of_term(term)


def _codes(codes: list[str] | None) -> tuple[str, ...]:
    return tuple(dict.fromkeys(code.upper() for code in codes or []))


@router.get("/search", response_model=ClassSearchResult)
async def search_sections(
    service: ServiceDep,
    term: TermQuery,
    subject: Annotated[str | None, Query(pattern=r"^[A-Za-z]{2,5}$")] = None,
    course_number: Annotated[
        str | None, Query(alias="courseNumber", pattern=r"^[0-9A-Za-z]{1,6}$")
    ] = None,
    keyword: Annotated[str | None, Query(min_length=2, max_length=100)] = None,
    attribute: Annotated[
        list[BannerCode] | None,
        Query(max_length=MAX_CODES, description="Any of these attributes"),
    ] = None,
    campus: Annotated[
        list[BannerCode] | None,
        Query(max_length=MAX_CODES, description="At any of these campuses"),
    ] = None,
    instructional_method: Annotated[
        list[BannerCode] | None,
        Query(
            alias="instructionalMethod",
            max_length=MAX_CODES,
            description="Taught in any of these ways, such as CLAS or OLL",
        ),
    ] = None,
    part_of_term: Annotated[
        list[BannerCode] | None,
        Query(alias="partOfTerm", max_length=MAX_CODES),
    ] = None,
    course_number_from: Annotated[
        CourseNumberEnd, Query(alias="courseNumberFrom")
    ] = None,
    course_number_to: Annotated[CourseNumberEnd, Query(alias="courseNumberTo")] = None,
    instructor: Annotated[
        str | None,
        Query(
            min_length=2,
            max_length=60,
            description="Any part of an instructor's name, in any order",
        ),
    ] = None,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = DEFAULT_PAGE_SIZE,
) -> ClassSearchResult:
    """Sections in a term from Banner's public class search, with live seats.

    Needs a subject, keyword, attribute or instructor; the other filters
    only narrow those, since a whole-term listing is too large to serve.
    """
    if not (subject or keyword or attribute or instructor):
        raise HTTPException(
            status_code=422,
            detail="Search by subject, keyword, attribute or instructor.",
        )
    filters = SearchFilters(
        term=term,
        subject=(subject or "").upper(),
        course_number=(course_number or "").upper(),
        keyword=(keyword or "").strip(),
        attributes=_codes(attribute),
        campuses=_codes(campus),
        instructional_methods=_codes(instructional_method),
        parts_of_term=_codes(part_of_term),
        course_number_from=course_number_from or "",
        course_number_to=course_number_to or "",
        instructor=" ".join((instructor or "").split()),
        offset=offset,
        limit=limit,
    )
    with banner_errors():
        return await service.search(filters)


@router.get("/sections/{crn}", response_model=SectionSummary)
async def get_section(
    service: ServiceDep, crn: CrnPath, term: TermQuery
) -> SectionSummary:
    """The course a CRN belongs to in a term, such as CIS 3441-702 Software Security."""
    with banner_errors(not_found=f"There's no CRN {crn} in this term."):
        return await service.section(term, crn)
