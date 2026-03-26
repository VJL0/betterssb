"""Course catalog search endpoints and typeahead lookups."""

from __future__ import annotations

from fastapi import APIRouter, Form, Query

from app.models import CodeDescription, CourseSearchResponse
from app.sample_data import (
    ATTRIBUTES,
    COLLEGES,
    COURSE_SEARCH_RESPONSE,
    DIVISIONS,
    SUBJECTS,
    TERMS,
)

router = APIRouter(prefix="/courseSearch", tags=["Course Search — Lookups"])
results_router = APIRouter(prefix="/courseSearchResults", tags=["Course Search — Results"])


# ── Typeaheads ───────────────────────────────────────────────────────────────


@router.get(
    "/getTerms",
    summary="List available terms",
    description="""
Returns the list of academic terms available for course search.
Used to populate the term selector dropdown.

Each term has a 6-digit `code` (e.g. `202536` = 2025 Fall) and a human-readable `description`.

The `_` param is a jQuery cache-buster (`Date.now()`) — safe to omit.
""",
    response_model=list[CodeDescription],
)
async def get_terms(
    searchTerm: str = Query("", description="Filter terms by search text"),
    offset: int = Query(1, description="1-based page offset"),
    max: int = Query(10, description="Maximum results to return"),
    _: str = Query("", description="Cache buster (Date.now()) — optional"),
) -> list[CodeDescription]:
    return TERMS


@router.get(
    "/get_subject",
    summary="Subject typeahead",
    description="""
Returns subject codes (e.g. CIS, MATH, ENGL) for the given term.
Used to populate the subject filter dropdown in the search form.
""",
    response_model=list[CodeDescription],
)
async def get_subjects(
    term: str = Query(..., description="Term code", examples=["202536"]),
    searchTerm: str = Query("", description="Filter by typed text"),
    offset: int = Query(1, description="1-based offset"),
    max: int = Query(500, description="Max results"),
    uniqueSessionId: str = Query("", description="Client session ID"),
    _: str = Query("", description="Cache buster — optional"),
) -> list[CodeDescription]:
    return SUBJECTS


@router.get(
    "/get_college",
    summary="College typeahead",
    description="Returns college codes for the given term.",
    response_model=list[CodeDescription],
)
async def get_colleges(
    term: str = Query(..., description="Term code", examples=["202536"]),
    searchTerm: str = Query("", description="Filter by typed text"),
    offset: int = Query(1, description="1-based offset"),
    max: int = Query(50, description="Max results"),
    uniqueSessionId: str = Query("", description="Client session ID"),
    _: str = Query("", description="Cache buster — optional"),
) -> list[CodeDescription]:
    return COLLEGES


@router.get(
    "/get_division",
    summary="Division typeahead",
    description="Returns division codes (Undergraduate, Graduate, etc.) for the given term.",
    response_model=list[CodeDescription],
)
async def get_divisions(
    term: str = Query(..., description="Term code", examples=["202536"]),
    searchTerm: str = Query("", description="Filter by typed text"),
    offset: int = Query(1, description="1-based offset"),
    max: int = Query(10, description="Max results"),
    uniqueSessionId: str = Query("", description="Client session ID"),
    _: str = Query("", description="Cache buster — optional"),
) -> list[CodeDescription]:
    return DIVISIONS


@router.get(
    "/get_attribute",
    summary="Course attribute typeahead",
    description="Returns course attribute codes (GenEd flags, etc.) for the given term.",
    response_model=list[CodeDescription],
)
async def get_attributes(
    term: str = Query(..., description="Term code", examples=["202536"]),
    searchTerm: str = Query("", description="Filter by typed text"),
    offset: int = Query(1, description="1-based offset"),
    max: int = Query(100, description="Max results"),
    uniqueSessionId: str = Query("", description="Client session ID"),
    _: str = Query("", description="Cache buster — optional"),
) -> list[CodeDescription]:
    return ATTRIBUTES


@router.post(
    "/resetDataForm",
    summary="Reset course search form",
    description="""
Resets server-side course and section search state.
Should be called before starting a new search to clear stale data.

**Content-Type:** `application/x-www-form-urlencoded`
""",
)
async def reset_data_form(
    resetCourses: str = Form("true", description='`"true"` to reset course results'),
    resetSections: str = Form("true", description='`"true"` to reset section results'),
) -> dict:
    return {"reset": True}


# ── Search Results ───────────────────────────────────────────────────────────


@results_router.get(
    "/courseSearchResults",
    summary="Search course catalog",
    description="""
Execute a paginated course catalog search with optional filters.

Returns course-level results (not individual sections). Each course includes
metadata like title, credit hours, subject, college, division, and whether
prerequisite checking is enabled.

**Pagination**: Use `pageOffset` (0-based) and `pageMaxSize`.

**Sorting**: Use `sortColumn` and `sortDirection`.
""",
    response_model=CourseSearchResponse,
)
async def search_courses(
    txt_term: str = Query(..., description="**Required.** Term code", examples=["202536"]),
    txt_subject: str = Query("", description="Subject code filter (e.g. CIS)"),
    txt_courseNumber: str = Query("", description="Specific course number"),
    txt_college: str = Query("", description="College code filter"),
    txt_division: str = Query("", description="Division code filter"),
    txt_attribute: str = Query("", description="Course attribute filter"),
    txt_keywordall: str = Query("", description="Keyword search across all fields"),
    txt_courseTitle: str = Query("", description="Course title search"),
    txt_course_number_range_From: str = Query("", description="Course number range start"),
    txt_course_number_range_To: str = Query("", description="Course number range end"),
    txt_credithourlow: str = Query("", description="Minimum credit hours"),
    txt_credithourhigh: str = Query("", description="Maximum credit hours"),
    startDatepicker: str = Query("", description="Part-of-term start date"),
    endDatepicker: str = Query("", description="Part-of-term end date"),
    uniqueSessionId: str = Query("", description="Client session ID"),
    pageOffset: int = Query(0, description="0-based page offset"),
    pageMaxSize: int = Query(50, description="Results per page"),
    sortColumn: str = Query("subjectDescription", description="Column to sort by"),
    sortDirection: str = Query("asc", description="`asc` or `desc`"),
) -> CourseSearchResponse:
    return COURSE_SEARCH_RESPONSE
