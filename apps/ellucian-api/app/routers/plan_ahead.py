"""Plan Ahead endpoints — build a course plan before registration opens."""

from __future__ import annotations

from fastapi import APIRouter, Form, Query

from app.models import (
    AddPlanItemResponse,
    CodeDescription,
    PlanBatchPayload,
    PlanEvent,
)
from app.sample_data import ADD_PLAN_ITEM_RESPONSE, PLAN_EVENTS, TERMS

router = APIRouter(prefix="/plan", tags=["Plan Ahead"])


@router.get(
    "/getTerms",
    summary="List terms for planning",
    description="""
Returns academic terms available for the Plan Ahead workflow.
Same `[{ code, description }]` response shape as other term endpoints.
""",
    response_model=list[CodeDescription],
)
async def get_plan_terms(
    searchTerm: str = Query("", description="Filter terms by typed text"),
    offset: int = Query(1, description="1-based page offset"),
    max: int = Query(10, description="Maximum results"),
    _: str = Query("", description="Cache buster — optional"),
) -> list[CodeDescription]:
    return TERMS


@router.get(
    "/selectPlan",
    summary="Select plan page",
    description="""
Returns the plan selection interface. In the real SSB this is a full HTML page
where the student chooses which saved plan to work on.
""",
)
async def select_plan() -> dict:
    return {"page": "selectPlan", "description": "Choose which saved plan to work on"}


@router.get(
    "/plan",
    summary="Plan workbench page",
    description="""
Returns the plan-ahead workbench UI. In the real SSB this is a full HTML page
with a calendar view and course list.
""",
)
async def plan_page(
    select: str = Query("", description="Optional plan index to pre-select"),
) -> dict:
    return {"page": "plan", "select": select}


@router.get(
    "/getPlanEvents",
    summary="Get plan calendar events",
    description="""
Returns calendar events for all planned courses. Each event includes meeting
times, faculty, and CRN information for rendering in a weekly calendar view.

Optionally filter by term.
""",
    response_model=list[PlanEvent],
)
async def get_plan_events(
    termFilter: str = Query("", description="Optional term code to filter by"),
) -> list[PlanEvent]:
    return PLAN_EVENTS


@router.post(
    "/addPlanItem",
    summary="Add a section to the plan",
    description="""
Add a specific course section (by CRN) to the current plan.

Returns the full plan course model with available actions (like "Remove").

**Content-Type:** `application/x-www-form-urlencoded`
""",
    response_model=AddPlanItemResponse,
)
async def add_plan_item(
    term: str = Form(..., description="Term code", examples=["202536"]),
    courseReferenceNumber: str = Form(..., description="CRN of the section to add", examples=["14523"]),
    section: str = Form("section", description='Literal string `"section"`'),
) -> AddPlanItemResponse:
    return ADD_PLAN_ITEM_RESPONSE


@router.post(
    "/delete",
    summary="Remove a plan item",
    description="""
Remove a course from the current plan by its row key.

**Content-Type:** `application/x-www-form-urlencoded`
""",
)
async def delete_plan_item(
    delete: str = Form(..., description="Row key / identifier of the item to remove"),
) -> dict:
    return {"success": True, "deleted": delete}


@router.post(
    "/submitPlan/batch",
    summary="Save plan changes (batch)",
    description="""
Save all plan changes in a single batch operation.

**Content-Type:** `application/json`

**Request body structure:**

- `create`: Array of new `PlanCourse` items to create
- `update`: Array of existing `PlanCourse` items to modify
- `destroy`: Array of `PlanCourse` items to remove
- `uniqueSessionId`: Client session ID

Each array element must be a full `PlanCourse` model object.
""",
)
async def submit_plan_batch(payload: PlanBatchPayload) -> dict:
    return {
        "success": True,
        "created": len(payload.create),
        "updated": len(payload.update),
        "destroyed": len(payload.destroy),
    }
