"""Section search and class search endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Form, Query

from app.models import CodeDescription, SectionSearchResponse
from app.sample_data import SECTION_SEARCH_RESPONSE, SUBJECTS

router = APIRouter(prefix="/searchResults", tags=["Section Search"])
class_search_router = APIRouter(prefix="/classSearch", tags=["Section Search"])


@router.get(
    "/searchResults",
    summary="Search course sections",
    description="""
Search for specific **sections** of courses. Unlike the course catalog search,
this returns individual sections with:

- **Meeting times** (days, start/end times, building/room)
- **Instructor** information (name, email, Banner ID)
- **Seat availability** (enrolled, maximum, waitlist capacity/count)
- **CRN** (Course Reference Number) needed for registration
- **Section attributes** (GenEd flags, etc.)
- **Cross-list** information

This is the primary endpoint for the schedule builder and registration flows.
""",
    response_model=SectionSearchResponse,
)
async def search_sections(
    txt_term: str = Query(..., description="**Required.** Term code", examples=["202536"]),
    txt_subjectcoursecombo: str = Query("", description='Combined subject+course (e.g. `"CIS 1068"`)'),
    txt_subject: str = Query("", description="Subject code only (e.g. `CIS`)"),
    txt_courseNumber: str = Query("", description="Course number only (e.g. `1068`)"),
    txt_college: str = Query("", description="College code filter"),
    txt_division: str = Query("", description="Division code filter"),
    txt_attribute: str = Query("", description="Attribute code filter"),
    startDatepicker: str = Query("", description="Part-of-term start date filter"),
    endDatepicker: str = Query("", description="Part-of-term end date filter"),
    uniqueSessionId: str = Query("", description="Client session ID"),
    pageOffset: int = Query(0, description="0-based page offset"),
    pageMaxSize: int = Query(50, description="Results per page"),
    sortColumn: str = Query("subjectDescription", description="Column to sort by"),
    sortDirection: str = Query("asc", description='`"asc"` or `"desc"`'),
) -> SectionSearchResponse:
    return SECTION_SEARCH_RESPONSE


@class_search_router.get(
    "/get_subject",
    summary="Subject typeahead (class search variant)",
    description="""
Returns subject codes for the class search form. Identical response shape
to `courseSearch/get_subject` but scoped to the class search context.
""",
    response_model=list[CodeDescription],
)
async def class_search_get_subject(
    term: str = Query(..., description="Term code", examples=["202536"]),
    searchTerm: str = Query("", description="Filter by typed text"),
    offset: int = Query(1, description="1-based offset"),
    max: int = Query(500, description="Max results"),
    uniqueSessionId: str = Query("", description="Client session ID"),
    _: str = Query("", description="Cache buster — optional"),
) -> list[CodeDescription]:
    return SUBJECTS


@class_search_router.post(
    "/resetDataForm",
    summary="Reset class search form",
    description="""
Resets class search form state on the server. Similar to `courseSearch/resetDataForm`
but for the class search context.

**Content-Type:** `application/x-www-form-urlencoded`
""",
)
async def class_search_reset(
    resetCourses: str = Form("true", description='`"true"` to reset'),
    resetSections: str = Form("true", description='`"true"` to reset'),
) -> dict:
    return {"reset": True}
