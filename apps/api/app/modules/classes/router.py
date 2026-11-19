from __future__ import annotations

from collections.abc import Generator
from contextlib import contextmanager
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Response
from pydantic import StringConstraints

from app.core.cache import Cache, get_cache
from app.core.errors import Problem, upstream_failure_status
from app.core.http_cache import cached_publicly, public_cache_control
from app.core.pagination import InvalidCursor, decode_cursor, encode_cursor
from app.modules.classes.client import (
    TEMPLE_SSB_BASE_URL,
    BannerClassSearchClient,
    ClassSearchUnavailable,
    SearchFilters,
)
from app.modules.classes.schemas import (
    AttributeList,
    CampusList,
    PartOfTermList,
    SectionPage,
    SectionSummary,
    SubjectList,
    TermList,
)
from app.modules.classes.section_client import (
    BannerSectionClient,
    SectionNotFound,
    SectionUnavailable,
)
from app.modules.classes.service import (
    LOOKUP_TTL_SECONDS,
    MISSING_SECTION_TTL_SECONDS,
    SEARCH_TTL_SECONDS,
    ClassSearchService,
)

router = APIRouter(prefix="/classes", tags=["classes"])

MAX_PAGE_SIZE = 100
DEFAULT_PAGE_SIZE = 50
UNAVAILABLE = "Banner's class search isn't responding. Try again in a minute."

TermPath = Annotated[str, Path(pattern=r"^\d{6}$", description="Banner term code")]
BannerCode = Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9]{1,6}$")]
CourseNumberEnd = Annotated[str | None, Query(pattern=r"^\d{1,4}$")]
CrnPath = Annotated[
    str, Path(pattern=r"^\d{4,5}$", description="Four- or five-digit CRN")
]
MAX_CODES = 20


@contextmanager
def banner_errors(
    not_found: str = "", not_found_headers: dict[str, str] | None = None
) -> Generator[None]:
    """A missing CRN becomes a 404 with `not_found`; Banner failing, a 502 or 504."""
    try:
        yield
    except SectionNotFound as exc:
        raise HTTPException(
            status_code=404, detail=not_found, headers=not_found_headers
        ) from exc
    except (ClassSearchUnavailable, SectionUnavailable) as exc:
        raise HTTPException(
            status_code=upstream_failure_status(exc), detail=UNAVAILABLE
        ) from exc


def get_class_search_service(
    cache: Annotated[Cache | None, Depends(get_cache)],
) -> ClassSearchService:
    return ClassSearchService(
        BannerClassSearchClient(TEMPLE_SSB_BASE_URL),
        BannerSectionClient(TEMPLE_SSB_BASE_URL),
        cache,
    )


ServiceDep = Annotated[ClassSearchService, Depends(get_class_search_service)]


@router.get("/terms", response_model=TermList, **cached_publicly(LOOKUP_TTL_SECONDS))
async def list_terms(service: ServiceDep) -> TermList:
    """Terms with a published class schedule, newest first."""
    with banner_errors():
        return TermList(terms=await service.terms())


@router.get(
    "/terms/{term}/subjects",
    response_model=SubjectList,
    **cached_publicly(LOOKUP_TTL_SECONDS),
)
async def list_subjects(
    service: ServiceDep,
    term: TermPath,
    q: Annotated[str, Query(max_length=40)] = "",
) -> SubjectList:
    """Subjects offered in a term, optionally filtered by code or name."""
    with banner_errors():
        return SubjectList(subjects=await service.subjects(term, q))


@router.get(
    "/terms/{term}/attributes",
    response_model=AttributeList,
    **cached_publicly(LOOKUP_TTL_SECONDS),
)
async def list_attributes(service: ServiceDep, term: TermPath) -> AttributeList:
    """Section attributes for a term, such as GenEd areas and Writing Intensive."""
    with banner_errors():
        return AttributeList(attributes=await service.attributes(term))


@router.get(
    "/terms/{term}/campuses",
    response_model=CampusList,
    **cached_publicly(LOOKUP_TTL_SECONDS),
)
async def list_campuses(service: ServiceDep, term: TermPath) -> CampusList:
    """Campuses with sections in a term, such as Main, Center City and Japan."""
    with banner_errors():
        return CampusList(campuses=await service.campuses(term))


@router.get(
    "/terms/{term}/parts-of-term",
    response_model=PartOfTermList,
    **cached_publicly(LOOKUP_TTL_SECONDS),
)
async def list_parts_of_term(service: ServiceDep, term: TermPath) -> PartOfTermList:
    """Parts of a term, such as the full term and the 7-week halves, with their dates."""
    with banner_errors():
        return PartOfTermList(parts_of_term=await service.parts_of_term(term))


def _codes(codes: list[str] | None) -> tuple[str, ...]:
    return tuple(dict.fromkeys(code.upper() for code in codes or []))


@router.get(
    "/terms/{term}/sections",
    response_model=SectionPage,
    **cached_publicly(SEARCH_TTL_SECONDS),
)
async def search_sections(
    service: ServiceDep,
    term: TermPath,
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
    cursor: Annotated[
        str | None,
        Query(max_length=200, description="`nextCursor` from the page before"),
    ] = None,
    limit: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = DEFAULT_PAGE_SIZE,
) -> SectionPage:
    """Sections in a term from Banner's public class search, with live seats.

    The term's sections, filtered by the query parameters (a List, AIP-132).

    Needs a subject, keyword, attribute or instructor; the other filters
    only narrow those, since a whole-term listing is too large to serve.
    """
    if not (subject or keyword or attribute or instructor):
        raise HTTPException(
            status_code=422,
            detail="Search by subject, keyword, attribute or instructor.",
        )
    try:
        offset = decode_cursor(cursor) if cursor else 0
    except InvalidCursor as exc:
        raise HTTPException(
            status_code=422, detail="That page cursor isn't from this search."
        ) from exc
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
        result = await service.search(filters)
    loaded = offset + len(result.sections)
    more = bool(result.sections) and loaded < result.total_count
    return SectionPage(
        **result.model_dump(),
        next_cursor=encode_cursor(loaded) if more else None,
    )


@router.get(
    "/terms/{term}/sections/{crn}",
    response_model=SectionSummary,
    responses={404: {"model": Problem, "description": "The term has no such CRN"}},
)
async def get_section(
    service: ServiceDep, term: TermPath, crn: CrnPath, response: Response
) -> SectionSummary:
    """The course a CRN belongs to in a term, such as CIS 3441-702 Software Security.

    A CRN names a section only within its term, so the term is part of the path.
    Both answers are cached for as long as the API keeps them.
    """
    with banner_errors(
        not_found=f"There's no CRN {crn} in this term.",
        not_found_headers={
            "Cache-Control": public_cache_control(MISSING_SECTION_TTL_SECONDS)
        },
    ):
        section = await service.section(term, crn)
    response.headers["Cache-Control"] = public_cache_control(LOOKUP_TTL_SECONDS)
    return section
