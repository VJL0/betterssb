from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.cache import Cache, get_cache
from app.modules.classes.client import (
    TEMPLE_SSB_BASE_URL,
    BannerClassSearchClient,
    ClassSearchUnavailable,
    SearchFilters,
)
from app.modules.classes.schemas import ClassSearchResult, CodeDescription
from app.modules.classes.service import ClassSearchService

router = APIRouter(prefix="/classes", tags=["classes"])

MAX_PAGE_SIZE = 100
DEFAULT_PAGE_SIZE = 50
UNAVAILABLE = "Banner's class search isn't responding. Try again in a minute."

TermQuery = Annotated[str, Query(pattern=r"^\d{6}$", description="Banner term code")]


def get_class_search_service(
    cache: Annotated[Cache | None, Depends(get_cache)],
) -> ClassSearchService:
    return ClassSearchService(BannerClassSearchClient(TEMPLE_SSB_BASE_URL), cache)


ServiceDep = Annotated[ClassSearchService, Depends(get_class_search_service)]


@router.get("/terms", response_model=list[CodeDescription])
async def list_terms(service: ServiceDep) -> list[CodeDescription]:
    """Terms with a published class schedule, newest first."""
    try:
        return await service.terms()
    except ClassSearchUnavailable as exc:
        raise HTTPException(status_code=502, detail=UNAVAILABLE) from exc


@router.get("/subjects", response_model=list[CodeDescription])
async def list_subjects(
    service: ServiceDep,
    term: TermQuery,
    q: Annotated[str, Query(max_length=40)] = "",
) -> list[CodeDescription]:
    """Subjects offered in a term, optionally filtered by code or name."""
    try:
        return await service.subjects(term, q)
    except ClassSearchUnavailable as exc:
        raise HTTPException(status_code=502, detail=UNAVAILABLE) from exc


@router.get("/attributes", response_model=list[CodeDescription])
async def list_attributes(
    service: ServiceDep, term: TermQuery
) -> list[CodeDescription]:
    """Section attributes for a term, such as GenEd areas and Writing Intensive."""
    try:
        return await service.attributes(term)
    except ClassSearchUnavailable as exc:
        raise HTTPException(status_code=502, detail=UNAVAILABLE) from exc


@router.get("/search", response_model=ClassSearchResult)
async def search_sections(
    service: ServiceDep,
    term: TermQuery,
    subject: Annotated[str | None, Query(pattern=r"^[A-Za-z]{2,5}$")] = None,
    course_number: Annotated[
        str | None, Query(alias="courseNumber", pattern=r"^[0-9A-Za-z]{1,6}$")
    ] = None,
    keyword: Annotated[str | None, Query(min_length=2, max_length=100)] = None,
    attribute: Annotated[str | None, Query(pattern=r"^[A-Za-z0-9]{1,6}$")] = None,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = DEFAULT_PAGE_SIZE,
) -> ClassSearchResult:
    """Sections in a term from Banner's public class search, with live seats.

    Needs a subject, keyword or attribute; a whole-term listing is too large to serve.
    """
    if not (subject or keyword or attribute):
        raise HTTPException(
            status_code=422, detail="Search by subject, keyword or attribute."
        )
    filters = SearchFilters(
        term=term,
        subject=(subject or "").upper(),
        course_number=(course_number or "").upper(),
        keyword=(keyword or "").strip(),
        attribute=(attribute or "").upper(),
        offset=offset,
        limit=limit,
    )
    try:
        return await service.search(filters)
    except ClassSearchUnavailable as exc:
        raise HTTPException(status_code=502, detail=UNAVAILABLE) from exc
