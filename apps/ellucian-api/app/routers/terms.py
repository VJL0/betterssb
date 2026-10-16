"""Term selection endpoints shared across flows."""

from __future__ import annotations

from fastapi import APIRouter, Form, Query

from app.models import CodeDescription, TermSearchResult
from app.sample_data import TERMS, TERM_SEARCH_RESULT

router = APIRouter(prefix="/term", tags=["Term Selection"])


@router.get(
    "/saveTerm",
    summary="Save selected term",
    description="""
Persist the selected term for the current flow. This sets server-side session state
so that subsequent requests (search, plan, registration) operate on the correct term.

**Must be called before performing searches or registration actions.**
""",
    response_model=dict,
)
async def save_term(
    mode: str = Query(..., description='Flow mode: `"plan"`, `"registration"`, or `"courseSearch"`', examples=["registration"]),
    term: str = Query(..., description="Term code", examples=["202536"]),
    uniqueSessionId: str = Query(..., description="Client-generated session ID", examples=["abc1234567890"]),
) -> dict:
    return {"success": True, "mode": mode, "term": term}


@router.post(
    "/search",
    summary="Validate term + study path / PIN",
    description="""
Validate a term selection along with optional study path and alternate PIN.
Returns whether registration is allowed for the selected term and any eligibility errors.

**URL query param `mode`** determines which flow the validation is for.

**Content-Type:** `application/x-www-form-urlencoded`

The form body contains `term`, `studyPath`, `studyPathText`, `altPin`,
`startDatepicker`, `endDatepicker`, and `uniqueSessionId`.
""",
    response_model=TermSearchResult,
)
async def search_term(
    mode: str = Query("registration", description='URL query param — `"registration"` or `"plan"`'),
    term: str = Form(..., description="Term code", examples=["202536"]),
    studyPath: str = Form("", description="Study path code"),
    studyPathText: str = Form("", description="Study path display text"),
    altPin: str = Form("", description="Alternate PIN if required by the institution"),
    startDatepicker: str = Form("", description="Optional start date filter"),
    endDatepicker: str = Form("", description="Optional end date filter"),
    uniqueSessionId: str = Form(..., description="Client session ID", examples=["abc1234567890"]),
) -> TermSearchResult:
    return TERM_SEARCH_RESULT
