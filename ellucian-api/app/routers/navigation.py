"""Shell / navigation page endpoints — top-level HTML pages users navigate to."""

from __future__ import annotations

from fastapi import APIRouter, Query

router = APIRouter(tags=["Shell / Navigation Pages"])


@router.get(
    "/registration",
    summary="Registration hub / landing page",
    description="""
The main registration landing page. This is the entry point students see after
logging in via CAS/SSO. From here they can navigate to:

- Course Search
- Plan Ahead
- Register for Classes
- View Registration Information

In the real SSB this returns a full HTML page.
""",
)
async def registration_hub() -> dict:
    return {
        "page": "registration",
        "links": [
            {"label": "Search for Classes", "url": "/courseSearch/courseSearch"},
            {"label": "Plan Ahead", "url": "/plan/selectPlan"},
            {"label": "Register for Classes", "url": "/classRegistration/classRegistration"},
            {"label": "View Registration Information", "url": "/registrationHistory/registrationHistory"},
        ],
    }


@router.get(
    "/term/termSelection",
    summary="Term picker page",
    description="""
The term selection page displayed before entering a specific flow.
The `mode` parameter determines which flow the user is entering.

After selecting a term, SSB redirects to the appropriate flow page.
""",
)
async def term_selection(
    mode: str = Query(
        ...,
        description='Flow to enter after selecting a term: `"plan"`, `"registration"`, or `"courseSearch"`',
        examples=["registration"],
    ),
) -> dict:
    return {"page": "termSelection", "mode": mode}


@router.get(
    "/courseSearch/courseSearch",
    summary="Course catalog search page",
    description="""
The course catalog search UI page. Provides a form with filters for subject,
college, division, attributes, credit hours, keywords, etc.

Results are loaded asynchronously via `courseSearchResults/courseSearchResults`.
""",
)
async def course_search_page() -> dict:
    return {"page": "courseSearch"}


@router.get(
    "/menu",
    summary="Menu fragment",
    description="""
Returns a navigation menu fragment filtered by type.
In the real SSB this returns XML; here it returns JSON.

Common types: `Personal`, `Registration`, `StudentRecords`.
""",
)
async def menu_fragment(
    type: str = Query(..., description="Menu type to retrieve", examples=["Personal"]),
) -> dict:
    return {
        "type": type,
        "items": [
            {"label": "Personal Information", "url": "/personalInformation"},
            {"label": "Address & Phone", "url": "/addressPhone"},
        ],
    }
