"""Class Registration (Add/Drop) endpoints — the critical registration flow."""

from __future__ import annotations

from fastapi import APIRouter, Form, Query
from fastapi.responses import HTMLResponse

from app.models import (
    AddCRNRegistrationResponse,
    AddRegistrationItemResponse,
    CodeDescription,
    GetPlansResponse,
    SubmitRegistrationBatchPayload,
    TuitionFeeResponse,
)
from app.sample_data import (
    ADD_CRN_RESPONSE,
    ADD_ITEM_RESPONSE,
    GET_PLANS_RESPONSE,
    SECTION_DETAILS_CRN,
    TERMS,
    TUITION_FEE_RESPONSE,
)

router = APIRouter(prefix="/classRegistration", tags=["Class Registration"])


@router.get(
    "/classRegistration",
    summary="Registration page",
    description="""
The main add/drop / manage schedule UI page. In the real SSB this returns
full HTML with the registration interface containing:
- Summary tab (registered courses)
- My Plans tab
- Schedule view
- CRN entry form
""",
)
async def registration_page() -> dict:
    return {"page": "classRegistration"}


@router.get(
    "/getTerms",
    summary="List registration terms",
    description="""
Returns academic terms available for class registration.
This may differ from course search terms — only terms with open or upcoming
registration windows are included.
""",
    response_model=list[CodeDescription],
)
async def get_registration_terms(
    searchTerm: str = Query("", description="Filter terms by typed text"),
    offset: int = Query(1, description="1-based offset"),
    max: int = Query(10, description="Maximum results"),
    _: str = Query("", description="Cache buster — optional"),
) -> list[CodeDescription]:
    return TERMS[:3]


@router.get(
    "/reset",
    summary="Reset registration UI state",
    description="""
Reset the registration session state and optionally change the active tab.
Should be called after selecting a term and before adding courses.

Returns the current registration state as JSON.
""",
)
async def reset_class_registration(
    selectedTab: str = Query("true", description="Whether a specific tab is selected"),
    sortColumn: str = Query("courseTitle", description="Sort column for the course list"),
    sortDirection: str = Query("asc", description='`"asc"` or `"desc"`'),
    uniqueSessionId: str = Query("", description="Client session ID"),
) -> dict:
    return {"success": True, "registeredCourses": [], "sortColumn": sortColumn, "sortDirection": sortDirection}


@router.get(
    "/getSectionDetailsFromCRN",
    summary="Get section details by CRN",
    description="""
Fetch full section metadata for a given CRN within the registration context.
Returns structured JSON including enrollment counts, faculty, meeting times,
and section status.
""",
)
async def get_section_details_from_crn(
    courseReferenceNumber: str = Query(..., description="CRN", examples=["14523"]),
    term: str = Query(..., description="Term code", examples=["202536"]),
) -> dict:
    return SECTION_DETAILS_CRN


@router.get(
    "/getPlans",
    summary="Load saved plans",
    description="""
Retrieve all saved plans available during the registration flow. This is used to
populate the **"My Plans"** tab, allowing students to quickly import all courses
from a pre-built plan.

Each plan contains:
- Plan metadata (id, description, last modified, total planned/registered credit hours)
- `planCourses` — list of courses with CRNs, details, and registration status
- `selectPlanConfig` — UI configuration for the plan selector
""",
    response_model=GetPlansResponse,
)
async def get_plans() -> GetPlansResponse:
    return GET_PLANS_RESPONSE


@router.get(
    "/renderMyPlans",
    summary="My Plans panel (HTML)",
    description="""
Returns the 'My Plans' panel as an HTML fragment for the registration UI.
Contains the list of planned courses with an "Add All from Plan" button.
""",
    response_class=HTMLResponse,
)
async def render_my_plans() -> HTMLResponse:
    return HTMLResponse(
        "<div id='myPlansPanel'>"
        "<h4>Fall 2025 Plan</h4>"
        "<ul>"
        "<li>CIS 1068 — Program Design and Abstraction (4 cr)</li>"
        "<li>CIS 2168 — Data Structures (4 cr)</li>"
        "</ul>"
        "<button>Add All from Plan</button>"
        "</div>"
    )


@router.get(
    "/renderMySchedule",
    summary="Current schedule (HTML)",
    description="""
Returns the current schedule view as an HTML fragment showing all
registered and staged courses in a table format.
""",
    response_class=HTMLResponse,
)
async def render_my_schedule() -> HTMLResponse:
    return HTMLResponse(
        "<div id='mySchedule'>"
        "<table><tr><th>CRN</th><th>Course</th><th>Days</th><th>Time</th><th>Status</th></tr>"
        "<tr><td>14523</td><td>CIS 1068-001</td><td>MW</td><td>09:30-10:50</td><td>Registered</td></tr>"
        "</table></div>"
    )


@router.get(
    "/addRegistrationItem",
    summary="Stage a single CRN",
    description="""
Stage a single CRN for registration. This adds it to the **temporary registration
list** but does **NOT** submit it.

The response contains a `model` field with the full `RegistrationTemporaryView`
object. **This exact model object must be passed back unchanged** in the `update`
array of `submitRegistration/batch` to complete the registration.

Set `olr=true` for online learning sections that require a separate acknowledgment.
""",
    response_model=AddRegistrationItemResponse,
)
async def add_registration_item(
    term: str = Query(..., description="Term code", examples=["202536"]),
    courseReferenceNumber: str = Query(..., description="CRN to stage", examples=["14523"]),
    olr: str = Query("false", description='`"true"` for online learning sections, `"false"` otherwise'),
) -> AddRegistrationItemResponse:
    return ADD_ITEM_RESPONSE


@router.post(
    "/addCRNRegistrationItems",
    summary="Stage multiple CRNs at once",
    description="""
Stage multiple CRNs in a single request. Typically used for **"Add All from Plan"**
where all planned CRNs are added simultaneously.

**Content-Type:** `application/x-www-form-urlencoded`

The response `aaData` array contains one result per CRN, each with:
- `success` — whether staging succeeded
- `model` — the `RegistrationTemporaryView` object (pass back to submit)
- `message` — error message if failed

Also returns `anyOLR` (online learning sections requiring acknowledgment)
and `anyAuthorizationRequired` (sections needing instructor authorization).
""",
    response_model=AddCRNRegistrationResponse,
)
async def add_crn_registration_items(
    crnList: str = Form(..., description='Comma-separated CRNs (e.g. `"14523,14524,14525"`)', examples=["14523,14524"]),
    term: str = Form(..., description="Term code", examples=["202536"]),
) -> AddCRNRegistrationResponse:
    return ADD_CRN_RESPONSE


@router.post(
    "/submitRegistration/batch",
    summary="SUBMIT registration (critical)",
    description="""
## The most important endpoint — submits all staged registration changes.

This is the **only endpoint that actually commits** registration changes.
Everything else (`addRegistrationItem`, `addCRNRegistrationItems`) only stages courses.

**Content-Type:** `application/json`

### Request body

```json
{
  "create": [],
  "update": [
    { "courseReferenceNumber": "14523", "term": "202536", ... },
    { "courseReferenceNumber": "14524", "term": "202536", ... }
  ],
  "destroy": [],
  "uniqueSessionId": "abc1234567890"
}
```

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `create` | array | New items (rarely used — items are staged via add endpoints first) |
| `update` | array | **Primary field** — full `RegistrationTemporaryView` model objects from staging |
| `destroy` | array | Items to **drop** from registration |
| `uniqueSessionId` | string | Must match the session ID used throughout the flow |

### Important rules

1. The `update` array must contain the **exact model objects** returned by
   `addRegistrationItem` (`.model`) or `addCRNRegistrationItems` (`.aaData[].model`).
   Pass them through **opaquely** — do not modify them.

2. The `destroy` array is used to **drop** courses from your registration.

3. The `create` array is rarely used — items are typically staged via the add endpoints first.

### Response

Returns per-CRN results with registration status. Parse to determine which courses
were successfully registered and which had errors (time conflicts, closed sections,
prerequisite failures, capacity exceeded, etc.).
""",
)
async def submit_registration_batch(payload: SubmitRegistrationBatchPayload) -> dict:
    results = []
    for item in payload.update:
        crn = item.get("courseReferenceNumber", "unknown")
        results.append({
            "courseReferenceNumber": crn,
            "status": "Registered",
            "statusIndicator": "R",
            "message": "",
        })
    for item in payload.destroy:
        crn = item.get("courseReferenceNumber", "unknown")
        results.append({
            "courseReferenceNumber": crn,
            "status": "Deleted",
            "statusIndicator": "D",
            "message": "Successfully dropped",
        })
    return {
        "success": True,
        "results": results,
        "totalRegistered": len(payload.update),
        "totalDropped": len(payload.destroy),
    }


@router.get(
    "/renderTuitionFeeDetail",
    summary="Tuition & fee breakdown",
    description="""
Returns the tuition and fee breakdown for the current registration state.

Includes itemized fees (tuition, technology fee, transportation, student activity)
with formatted dollar amounts, currency code, and a total.

Also returns `totalCreditHours` for the registered term.
""",
    response_model=TuitionFeeResponse,
)
async def get_tuition_fee_detail() -> TuitionFeeResponse:
    return TUITION_FEE_RESPONSE
