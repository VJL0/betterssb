"""Registration History endpoints — view past and current registrations."""

from __future__ import annotations

from fastapi import APIRouter, Query
from fastapi.responses import HTMLResponse

from app.models import (
    RegistrationEvent,
    RegistrationHistoryResponse,
    RegistrationSection,
)
from app.sample_data import REG_EVENTS, REG_HISTORY_RESPONSE, REG_SECTIONS

router = APIRouter(tags=["Registration History"])


@router.get(
    "/registrationHistory/registrationHistory",
    summary="Registration history page",
    description="Returns the registration history / view registration information page (HTML in real SSB).",
)
async def reg_history_page() -> dict:
    return {"page": "registrationHistory"}


@router.get(
    "/registrationHistory/reset",
    summary="Load registration history for a term",
    description="""
Load (or reset) registration history for a specific term. Returns all
registered courses for the term with details including:

- Course info (CRN, title, subject, credits)
- Registration status (Registered, Dropped, Waitlisted)
- Instructor names
- Grade information (if available)
- Credit/billing hour totals
""",
    response_model=RegistrationHistoryResponse,
)
async def reset_registration_history(
    term: str = Query(..., description="Term code to load history for", examples=["202536"]),
) -> RegistrationHistoryResponse:
    return REG_HISTORY_RESPONSE


@router.get(
    "/registrationHistory/renderActiveRegistrations",
    summary="Active registrations",
    description="Returns currently active registrations for the history view.",
)
async def render_active_registrations() -> dict:
    return {"registrations": REG_HISTORY_RESPONSE.data.registrations}


@router.get(
    "/classRegistration/getRegistrationEvents",
    summary="Registration calendar events",
    description="""
Returns calendar-formatted events for all registered sections. Each event has
ISO 8601 start/end times, a title, and metadata for rendering in a weekly
calendar view (FullCalendar-compatible format).
""",
    response_model=list[RegistrationEvent],
    tags=["Registration History"],
)
async def get_registration_events(
    termFilter: str = Query("", description="Optional term filter"),
) -> list[RegistrationEvent]:
    return REG_EVENTS


@router.get(
    "/classRegistration/getMeetingInformationForRegistrations",
    summary="Meeting details for registered sections",
    description="""
Returns detailed meeting time and section information for all currently
registered sections. Includes faculty, meeting times (with day-of-week
booleans), grading mode, and credit hours.
""",
    response_model=list[RegistrationSection],
    tags=["Registration History"],
)
async def get_meeting_info() -> list[RegistrationSection]:
    return REG_SECTIONS


@router.get(
    "/classRegistration/print",
    summary="Printable schedule",
    description="Returns an HTML view of the current schedule formatted for printing.",
    response_class=HTMLResponse,
    tags=["Registration History"],
)
async def print_schedule() -> HTMLResponse:
    return HTMLResponse(
        "<html><body><h1>Schedule — 2025 Fall</h1>"
        "<table><tr><th>CRN</th><th>Course</th><th>Title</th><th>Days</th><th>Time</th></tr>"
        "<tr><td>14523</td><td>CIS 1068</td><td>Program Design and Abstraction</td>"
        "<td>MW</td><td>09:30-10:50</td></tr></table></body></html>"
    )


@router.get(
    "/classRegistration/email",
    summary="Email schedule",
    description="Sends the current schedule to the specified email address.",
    tags=["Registration History"],
)
async def email_schedule(
    listOfEmails: str = Query(..., description="Email address to send to", examples=["student@temple.edu"]),
    subject: str = Query("", description="Email subject line"),
    scp: str = Query("false"),
) -> dict:
    return {"success": True, "emailSentTo": listOfEmails}
