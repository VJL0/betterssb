"""
Ellucian Self-Service Banner (SSB) — Interactive API Reference

A complete FastAPI mock of every SSB endpoint discovered from HAR captures
of Temple University's prd-xereg.temple.edu registration system.

Open /docs in your browser for the full interactive Swagger UI.
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import (
    class_registration,
    contact,
    course_search,
    navigation,
    plan_ahead,
    registration_history,
    section_details,
    section_search,
    terms,
)

DESCRIPTION = """
# Ellucian Self-Service Banner (SSB) API

Complete interactive documentation for **every** endpoint on the Ellucian SSB
student registration system, reverse-engineered from HAR network captures of
`prd-xereg.temple.edu`.

## How SSB Works

SSB is a **session-based** web application. After CAS/SSO login, the browser
holds a `JSESSIONID` cookie. Every AJAX request must include:

| Header | Value |
|--------|-------|
| `X-Synchronizer-Token` | CSRF token (UUID-v4) extracted from the page DOM |
| `X-Requested-With` | `XMLHttpRequest` |
| `Accept` | `application/json, text/javascript, */*; q=0.01` |

The CSRF token is embedded in the HTML in one of three locations:
1. `<meta name="synchronizerToken" content="...">` → `.content`
2. `<input name="synchronizerToken" value="...">` → `.value`
3. Inline JS: regex `synchronizerToken[^"]*"([0-9a-f-]{36})"`

## Base Path

All real endpoints live under:
```
https://prd-xereg.temple.edu/StudentRegistrationSsb/ssb/
```

## Endpoint Groups

| Tag | # Endpoints | Description |
|-----|-------------|-------------|
| **Shell / Navigation Pages** | 4 | Top-level HTML pages |
| **Term Selection** | 2 | Pick & validate the active term |
| **Course Search — Lookups** | 6 | Typeahead dropdowns + form reset |
| **Course Search — Results** | 1 | Paginated course catalog search |
| **Section Search** | 3 | Section-level search + class search variants |
| **Section Details** | 13 | HTML fragment endpoints for detail modals |
| **Plan Ahead** | 7 | Build and save course plans |
| **Registration History** | 7 | View registrations, schedule, print/email |
| **Class Registration** | 12 | The full add/drop/submit registration flow |
| **Instructor & Utilities** | 3 | Contact cards, menus, preferences |

**Total: 58 endpoints**

## Key Concepts

- **Term code**: 6-digit string like `202536` (year + semester code)
- **CRN**: Course Reference Number — 5-digit string identifying a specific section
- **uniqueSessionId**: Client-generated ID to scope server-side search state
- **`_` param**: jQuery cache-buster (`Date.now()`) on many GET endpoints — safe to omit
- **RegistrationTemporaryView**: Opaque model returned by staging endpoints,
  must be passed back to `submitRegistration/batch` **unchanged**

## Typical Registration Flow

```
1. GET  /classRegistration/getTerms        → pick a term
2. GET  /term/saveTerm?mode=registration   → set the term
3. POST /term/search?mode=registration     → validate term + PIN
4. GET  /classRegistration/reset           → initialize UI state
5. GET  /classRegistration/getPlans        → load saved plans
6. POST /classRegistration/addCRNRegistrationItems
                                           → stage CRNs from plan
7. POST /classRegistration/submitRegistration/batch
                                           → SUBMIT registration
8. GET  /classRegistration/renderTuitionFeeDetail
                                           → view fee breakdown
```
"""

TAGS_METADATA = [
    {
        "name": "Shell / Navigation Pages",
        "description": "Top-level HTML pages users navigate to — registration hub, term picker, course search UI, and menu fragments.",
    },
    {
        "name": "Term Selection",
        "description": "Select and validate the active academic term. Shared across course search, planning, and registration flows. The `mode` parameter determines which server-side session state is affected.",
    },
    {
        "name": "Course Search — Lookups",
        "description": "Typeahead / dropdown endpoints for search filters (terms, subjects, colleges, divisions, attributes). All return `[{ code, description }]` arrays.",
    },
    {
        "name": "Course Search — Results",
        "description": "Execute paginated course catalog searches with optional filters. Returns course-level results (not individual sections).",
    },
    {
        "name": "Section Search",
        "description": "Search for specific sections with meeting times, instructor info, seat availability, and CRNs. This is the primary endpoint for the schedule builder.",
    },
    {
        "name": "Section Details",
        "description": "Detail endpoints for modals/popovers — prerequisites, corequisites, restrictions, mutual exclusions, fees, enrollment, bookstore, cross-listed sections, and more. All are `POST` with form-encoded `term` + `courseReferenceNumber` body, returning HTML fragments. Exception: `getFacultyMeetingTimes` is a `GET` returning JSON.",
    },
    {
        "name": "Plan Ahead",
        "description": "Build a course plan before the registration window opens. Plans are saved server-side and can be imported during registration via 'Add All from Plan'.",
    },
    {
        "name": "Registration History",
        "description": "View past and current registrations, calendar events, meeting details, and schedule export (print/email).",
    },
    {
        "name": "Class Registration",
        "description": "**The critical flow.** Stage CRNs, load plans, submit registration, view tuition/fees, and render schedule fragments. The `submitRegistration/batch` endpoint is the **only** one that actually commits changes.",
    },
    {
        "name": "Instructor & Utilities",
        "description": "Faculty contact cards, self-service navigation menus, and user preferences.",
    },
]

app = FastAPI(
    title="Ellucian SSB API Reference",
    version="1.0.0",
    description=DESCRIPTION,
    openapi_tags=TAGS_METADATA,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

PREFIX = "/StudentRegistrationSsb/ssb"

app.include_router(navigation.router, prefix=PREFIX)
app.include_router(terms.router, prefix=PREFIX)
app.include_router(course_search.router, prefix=PREFIX)
app.include_router(course_search.results_router, prefix=PREFIX)
app.include_router(section_search.router, prefix=PREFIX)
app.include_router(section_search.class_search_router, prefix=PREFIX)
app.include_router(section_details.router, prefix=PREFIX)
app.include_router(plan_ahead.router, prefix=PREFIX)
app.include_router(registration_history.router, prefix=PREFIX)
app.include_router(class_registration.router, prefix=PREFIX)
app.include_router(contact.router, prefix=PREFIX)


@app.get("/", tags=["Root"], summary="API info")
async def root() -> dict:
    return {
        "name": "Ellucian SSB API Reference",
        "version": "1.0.0",
        "docs": "/docs",
        "redoc": "/redoc",
        "base_path": "/StudentRegistrationSsb/ssb",
        "real_host": "https://prd-xereg.temple.edu",
        "total_endpoints": 58,
    }
