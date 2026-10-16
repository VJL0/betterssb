"""Section detail fragment endpoints (HTML modals and structured meeting times).

All POST endpoints here accept `application/x-www-form-urlencoded` bodies with
`term` and `courseReferenceNumber`. In the real SSB, these return HTML fragments
that are injected into modals/popovers.
"""

from __future__ import annotations

from fastapi import APIRouter, Form, Query
from fastapi.responses import HTMLResponse

from app.models import MeetingFaculty
from app.sample_data import MF_LAB, MF_MW

router = APIRouter(prefix="/searchResults", tags=["Section Details"])

SAMPLE_CLASS_DETAILS_HTML = """
<div class="classDetailsContainer">
  <h3>CIS 1068 - 001 Program Design and Abstraction</h3>
  <table>
    <tr><td>Term:</td><td>2025 Fall</td></tr>
    <tr><td>CRN:</td><td>14523</td></tr>
    <tr><td>Campus:</td><td>Main</td></tr>
    <tr><td>Instructional Method:</td><td>Traditional</td></tr>
    <tr><td>Credits:</td><td>4.000</td></tr>
    <tr><td>Seats Available:</td><td>2</td></tr>
    <tr><td>Schedule Type:</td><td>Lecture</td></tr>
    <tr><td>Instructor:</td><td>John Smith</td></tr>
    <tr><td>Meeting Times:</td><td>MW 09:30-10:50, SERC 116</td></tr>
  </table>
</div>
""".strip()


@router.post(
    "/getClassDetails",
    summary="Class detail panel (HTML)",
    description="""
Returns an HTML fragment containing full class details for a given CRN.
This is the content shown in the detail modal when a student clicks on a section.

Includes term, CRN, campus, instructional method, credits, seats, schedule type,
instructor name, and meeting times.

**Content-Type:** `application/x-www-form-urlencoded`
""",
    response_class=HTMLResponse,
)
async def get_class_details(
    term: str = Form(..., description="Term code", examples=["202536"]),
    courseReferenceNumber: str = Form(..., description="CRN", examples=["14523"]),
    first: str = Form("first", description='Literal `"first"` — signals initial load of the detail panel'),
) -> HTMLResponse:
    return HTMLResponse(content=SAMPLE_CLASS_DETAILS_HTML)


@router.post(
    "/getCourseDescription",
    summary="Course description (HTML)",
    description="""
Returns the catalog description text for a course. This is the long-form
description from the university bulletin.

**Content-Type:** `application/x-www-form-urlencoded`
""",
    response_class=HTMLResponse,
)
async def get_course_description(
    term: str = Form(..., description="Term code", examples=["202536"]),
    courseReferenceNumber: str = Form(..., description="CRN", examples=["14523"]),
) -> HTMLResponse:
    return HTMLResponse(
        "<p>Introduction to programming and problem solving using Java. "
        "Topics include data types, control structures, methods, arrays, "
        "object-oriented programming, and recursion.</p>"
    )


@router.post(
    "/getSectionCatalogDetails",
    summary="Section catalog details (HTML)",
    description="""
Returns catalog-level section information including credit hours, schedule type,
and part-of-term details.

**Content-Type:** `application/x-www-form-urlencoded`
""",
    response_class=HTMLResponse,
)
async def get_section_catalog_details(
    term: str = Form(..., description="Term code", examples=["202536"]),
    courseReferenceNumber: str = Form(..., description="CRN", examples=["14523"]),
) -> HTMLResponse:
    return HTMLResponse(
        "<div class='catalogDetails'>"
        "<p><strong>CIS 1068</strong> — Program Design and Abstraction</p>"
        "<p>4.000 Credit Hours — Lecture — Full Term</p>"
        "<p>Campus: Main — Instructional Method: Traditional</p>"
        "</div>"
    )


@router.post(
    "/getSectionPrerequisites",
    summary="Prerequisites (HTML)",
    description="""
Returns prerequisite requirements for the section. May include minimum grade
requirements and alternative prerequisite paths.

**Content-Type:** `application/x-www-form-urlencoded`
""",
    response_class=HTMLResponse,
)
async def get_prerequisites(
    term: str = Form(..., description="Term code", examples=["202536"]),
    courseReferenceNumber: str = Form(..., description="CRN", examples=["14523"]),
) -> HTMLResponse:
    return HTMLResponse(
        "<div class='preReqs'><p>Prerequisite: CIS 1057 (Minimum Grade of C-) "
        "or CIS 1068 Transfer Credit</p></div>"
    )


@router.post(
    "/getCorequisites",
    summary="Corequisites (HTML)",
    description="""
Returns corequisite requirements — courses that must be taken concurrently
with this section.

**Content-Type:** `application/x-www-form-urlencoded`
""",
    response_class=HTMLResponse,
)
async def get_corequisites(
    term: str = Form(..., description="Term code", examples=["202536"]),
    courseReferenceNumber: str = Form(..., description="CRN", examples=["14523"]),
) -> HTMLResponse:
    return HTMLResponse("<div class='coreqs'><p>None</p></div>")


@router.post(
    "/getCourseMutuallyExclusions",
    summary="Mutual exclusions (HTML)",
    description="""
Returns mutual exclusion rules — courses that **cannot** be taken together
or that overlap in content with this section.

**Content-Type:** `application/x-www-form-urlencoded`
""",
    response_class=HTMLResponse,
)
async def get_mutual_exclusions(
    term: str = Form(..., description="Term code", examples=["202536"]),
    courseReferenceNumber: str = Form(..., description="CRN", examples=["14523"]),
) -> HTMLResponse:
    return HTMLResponse("<div class='mutualExcl'><p>None</p></div>")


@router.post(
    "/getRestrictions",
    summary="Registration restrictions (HTML)",
    description="""
Returns registration restrictions such as major, level, class standing,
or cohort requirements.

**Content-Type:** `application/x-www-form-urlencoded`
""",
    response_class=HTMLResponse,
)
async def get_restrictions(
    term: str = Form(..., description="Term code", examples=["202536"]),
    courseReferenceNumber: str = Form(..., description="CRN", examples=["14523"]),
) -> HTMLResponse:
    return HTMLResponse(
        "<div class='restrictions'><p>Must be enrolled in one of the following Majors: "
        "Computer Science, Data Science, Information Science</p></div>"
    )


@router.post(
    "/getSectionAttributes",
    summary="Section attributes (HTML)",
    description="""
Returns section attributes like GenEd flags (Science & Technology,
Quantitative Reasoning, Writing Intensive, etc.).

**Content-Type:** `application/x-www-form-urlencoded`
""",
    response_class=HTMLResponse,
)
async def get_section_attributes(
    term: str = Form(..., description="Term code", examples=["202536"]),
    courseReferenceNumber: str = Form(..., description="CRN", examples=["14523"]),
) -> HTMLResponse:
    return HTMLResponse(
        "<div class='sectionAttrs'><table>"
        "<tr><td>GSST</td><td>GenEd: Science & Technology</td></tr>"
        "</table></div>"
    )


@router.post(
    "/getEnrollmentInfo",
    summary="Enrollment info (HTML)",
    description="""
Returns seat availability information:
- Maximum Enrollment
- Actual Enrollment
- Seats Available
- Wait List Capacity / Actual / Available

**Content-Type:** `application/x-www-form-urlencoded`
""",
    response_class=HTMLResponse,
)
async def get_enrollment_info(
    term: str = Form(..., description="Term code", examples=["202536"]),
    courseReferenceNumber: str = Form(..., description="CRN", examples=["14523"]),
) -> HTMLResponse:
    return HTMLResponse(
        "<div class='enrollmentInfo'>"
        "<table>"
        "<tr><td>Maximum Enrollment:</td><td>30</td></tr>"
        "<tr><td>Actual Enrollment:</td><td>28</td></tr>"
        "<tr><td>Seats Available:</td><td>2</td></tr>"
        "<tr><td>Wait List Capacity:</td><td>5</td></tr>"
        "<tr><td>Wait List Actual:</td><td>0</td></tr>"
        "<tr><td>Wait List Available:</td><td>5</td></tr>"
        "</table></div>"
    )


@router.post(
    "/getFees",
    summary="Course fees (HTML)",
    description="""
Returns any additional fees associated with the section (lab fees, course
material fees, etc.).

**Content-Type:** `application/x-www-form-urlencoded`
""",
    response_class=HTMLResponse,
)
async def get_fees(
    term: str = Form(..., description="Term code", examples=["202536"]),
    courseReferenceNumber: str = Form(..., description="CRN", examples=["14523"]),
) -> HTMLResponse:
    return HTMLResponse("<div class='fees'><p>No additional fees</p></div>")


@router.post(
    "/getSectionBookstoreDetails",
    summary="Bookstore / textbook info (HTML)",
    description="""
Returns textbook and bookstore details for the section, including required
and recommended materials with ISBNs.

**Content-Type:** `application/x-www-form-urlencoded`
""",
    response_class=HTMLResponse,
)
async def get_bookstore_details(
    term: str = Form(..., description="Term code", examples=["202536"]),
    courseReferenceNumber: str = Form(..., description="CRN", examples=["14523"]),
) -> HTMLResponse:
    return HTMLResponse(
        "<div class='bookstore'>"
        "<p>Required: Introduction to Java Programming, 12th Ed. — ISBN 978-0134670942</p>"
        "</div>"
    )


@router.post(
    "/getXlstSections",
    summary="Cross-listed sections (HTML)",
    description="""
Returns other sections that are cross-listed with this one. Cross-listed
sections share enrollment caps across departments.

**Content-Type:** `application/x-www-form-urlencoded`
""",
    response_class=HTMLResponse,
)
async def get_crosslisted_sections(
    term: str = Form(..., description="Term code", examples=["202536"]),
    courseReferenceNumber: str = Form(..., description="CRN", examples=["14523"]),
) -> HTMLResponse:
    return HTMLResponse("<div class='xlst'><p>No cross-listed sections</p></div>")


@router.get(
    "/getFacultyMeetingTimes",
    summary="Faculty & meeting times (JSON)",
    description="""
Returns **structured JSON** data for faculty and meeting times.
Unlike all other detail endpoints which return HTML, this one returns JSON
that can be used programmatically.

Each entry has:
- `category` — meeting type category code
- `courseReferenceNumber` — the CRN
- `term` — term code
- `meetingTime` — object with day-of-week booleans (`monday` through `sunday`),
  `beginTime`/`endTime` in HHMM format, building/room, and credit hour info
""",
    response_model=list[MeetingFaculty],
)
async def get_faculty_meeting_times(
    term: str = Query(..., description="Term code", examples=["202536"]),
    courseReferenceNumber: str = Query(..., description="CRN", examples=["14523"]),
) -> list[MeetingFaculty]:
    return [MF_MW, MF_LAB]
