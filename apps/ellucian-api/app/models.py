"""Pydantic models mirroring every Ellucian Self-Service Banner JSON structure."""

from __future__ import annotations

from pydantic import BaseModel, Field


# ── Shared / Lookup ──────────────────────────────────────────────────────────

class CodeDescription(BaseModel):
    """Generic code + description pair used by term, subject, college, division, and attribute lookups."""

    code: str = Field(..., examples=["202536"], description="Unique identifier code")
    description: str = Field(..., examples=["2025 Fall"], description="Human-readable label")


# ── Faculty & Meeting Times ──────────────────────────────────────────────────

class Faculty(BaseModel):
    """Instructor assigned to a section."""

    bannerId: str = Field(..., examples=["912345678"], description="Faculty Banner ID")
    courseReferenceNumber: str = Field(..., examples=["14523"], description="CRN this faculty record is tied to")
    displayName: str = Field(..., examples=["John Smith"], description="Full display name")
    emailAddress: str = Field(..., examples=["jsmith@temple.edu"])
    primaryIndicator: bool = Field(..., description="True if this is the primary instructor")
    term: str = Field(..., examples=["202536"])


class MeetingTime(BaseModel):
    """A single meeting-time block (lecture, lab, recitation, etc.)."""

    beginTime: str = Field(..., examples=["0930"], description="24-hour HHMM start time")
    endTime: str = Field(..., examples=["1050"], description="24-hour HHMM end time")
    building: str = Field(..., examples=["SERC"])
    buildingDescription: str = Field(..., examples=["Science Ed & Research Ctr"])
    campus: str = Field(..., examples=["MN"])
    campusDescription: str = Field(..., examples=["Main"])
    room: str = Field(..., examples=["116"])
    creditHourSession: float = Field(..., examples=[4.0])
    hoursWeek: float = Field(..., examples=[2.67])
    meetingType: str = Field(..., examples=["LEC"])
    meetingTypeDescription: str = Field(..., examples=["Lecture"])
    startDate: str = Field(..., examples=["08/25/2025"])
    endDate: str = Field(..., examples=["12/08/2025"])
    monday: bool = False
    tuesday: bool = False
    wednesday: bool = False
    thursday: bool = False
    friday: bool = False
    saturday: bool = False
    sunday: bool = False


class MeetingFaculty(BaseModel):
    """A meeting-time block with its associated category and term."""

    category: str = Field(..., examples=["01"])
    courseReferenceNumber: str = Field(..., examples=["14523"])
    meetingTime: MeetingTime
    term: str = Field(..., examples=["202536"])


# ── Course Catalog ───────────────────────────────────────────────────────────

class Course(BaseModel):
    """A course from the catalog search (not a specific section)."""

    id: int
    termEffective: str = Field(..., examples=["202536"])
    courseNumber: str = Field(..., examples=["1068"])
    courseDisplay: str = Field(..., examples=["CIS 1068"])
    subject: str = Field(..., examples=["Computer & Info Science"])
    subjectCode: str = Field(..., examples=["CIS"])
    college: str = Field(..., examples=["Science & Technology"])
    collegeCode: str = Field(..., examples=["ST"])
    department: str = Field(..., examples=["Computer & Information Sciences"])
    departmentCode: str = Field(..., examples=["CIS"])
    courseTitle: str = Field(..., examples=["Program Design and Abstraction"])
    creditHourHigh: float | None = None
    creditHourLow: float = Field(..., examples=[4.0])
    creditHourIndicator: str | None = None
    subjectDescription: str = Field(..., examples=["Computer & Info Science"])
    courseDescription: str = Field("", examples=["Introduction to programming using Java..."])
    division: str = Field(..., examples=["Undergraduate"])
    termStart: str = Field(..., examples=["202536"])
    termEnd: str = Field(..., examples=["999999"])
    preRequisiteCheckMethodCde: str = Field(..., examples=["Y"])


class CourseSearchResponse(BaseModel):
    """Paginated course catalog search results."""

    success: bool = True
    totalCount: int = Field(..., examples=[142])
    data: list[Course]
    pageOffset: int = Field(0, examples=[0])
    pageMaxSize: int = Field(50, examples=[50])
    coursesFetchedCount: int = Field(..., examples=[50])
    pathMode: str = Field("search", examples=["search"])


# ── Sections ─────────────────────────────────────────────────────────────────

class SectionAttribute(BaseModel):
    code: str = Field(..., examples=["GSST"])
    description: str = Field(..., examples=["GenEd: Science & Technology"])


class Section(BaseModel):
    """A specific section of a course, with seats, instructor, and meeting times."""

    id: int
    term: str = Field(..., examples=["202536"])
    termDesc: str = Field(..., examples=["2025 Fall"])
    courseReferenceNumber: str = Field(..., examples=["14523"], description="CRN — the unique section identifier")
    partOfTerm: str = Field(..., examples=["1"])
    courseNumber: str = Field(..., examples=["1068"])
    courseDisplay: str = Field(..., examples=["CIS 1068"])
    subject: str = Field(..., examples=["CIS"])
    subjectDescription: str = Field(..., examples=["Computer & Info Science"])
    sequenceNumber: str = Field(..., examples=["001"], description="Section number")
    campusDescription: str = Field(..., examples=["Main"])
    scheduleTypeDescription: str = Field(..., examples=["Lecture"])
    courseTitle: str = Field(..., examples=["Program Design and Abstraction"])
    creditHours: float | None = None
    creditHourLow: float = Field(..., examples=[4.0])
    creditHourHigh: float | None = None
    maximumEnrollment: int = Field(..., examples=[30])
    enrollment: int = Field(..., examples=[28])
    seatsAvailable: int = Field(..., examples=[2])
    waitCapacity: int = Field(..., examples=[5])
    waitCount: int = Field(0, examples=[0])
    waitAvailable: int = Field(..., examples=[5])
    openSection: bool = True
    subjectCourse: str = Field(..., examples=["CIS 1068"])
    faculty: list[Faculty] = []
    meetingsFaculty: list[MeetingFaculty] = []
    instructionalMethod: str = Field(..., examples=["TR"])
    instructionalMethodDescription: str = Field(..., examples=["Traditional"])
    feeAmount: float | None = None
    crossList: str | None = None
    crossListCapacity: int | None = None
    crossListCount: int | None = None
    isSectionLinked: bool = False
    sectionAttributes: list[SectionAttribute] = []


class SectionSearchResponse(BaseModel):
    """Paginated section search results."""

    success: bool = True
    totalCount: int = Field(..., examples=[12])
    data: list[Section]
    pageOffset: int = Field(0, examples=[0])
    pageMaxSize: int = Field(50, examples=[50])
    sectionsFetchedCount: int = Field(..., examples=[12])
    pathMode: str = Field("registration", examples=["registration"])


# ── Plan Ahead ───────────────────────────────────────────────────────────────

class PlanAction(BaseModel):
    description: str = Field(..., examples=["Remove"])
    isDeleteAction: bool = False
    planCourseStatus: str = Field(..., examples=["PLANNED"])


class PlanCourse(BaseModel):
    """A course line item inside a plan."""

    activeIndicator: bool = True
    attached: bool = False
    courseDisplay: str = Field(..., examples=["CIS 1068"])
    courseNumber: str = Field(..., examples=["1068"])
    courseReferenceNumber: str = Field(..., examples=["14523"])
    courseTitle: str = Field(..., examples=["Program Design and Abstraction"])
    creditHours: float = Field(..., examples=[4.0])
    gradingMode: str = Field(..., examples=["N"])
    gradingModeDescription: str = Field(..., examples=["Normal Grading Mode"])
    instructionalMethod: str = Field(..., examples=["TR"])
    instructionalMethodDescription: str = Field(..., examples=["Traditional"])
    partOfTerm: str = Field(..., examples=["1"])
    partOfTermDescription: str = Field(..., examples=["Full Term"])
    partOfTermStartDate: str = Field(..., examples=["08/25/2025"])
    partOfTermEndDate: str = Field(..., examples=["12/08/2025"])
    planStatus: str = Field(..., examples=["PLANNED"])
    scheduleType: str = Field(..., examples=["LEC"])
    scheduleTypeDescription: str = Field(..., examples=["Lecture"])
    subject: str = Field(..., examples=["CIS"])
    term: str = Field(..., examples=["202536"])
    section: str | None = Field(None, examples=["001"])
    availableActions: list[PlanAction] = []
    id: int | None = None
    isRegistered: bool = False


class AddPlanItemResponse(BaseModel):
    success: bool = True
    model: PlanCourse


class PlanEvent(BaseModel):
    """Calendar event for a planned course."""

    courseReferenceNumber: str = Field(..., examples=["14523"])
    courseNumber: str = Field(..., examples=["1068"])
    courseTitle: str = Field(..., examples=["Program Design and Abstraction"])
    subject: str = Field(..., examples=["CIS"])
    creditHours: float = Field(..., examples=[4.0])
    term: str = Field(..., examples=["202536"])
    section: str | None = None
    meetingTime: MeetingTime | None = None
    faculty: list[Faculty] | None = None
    category: str | None = None


class PlanBatchPayload(BaseModel):
    """Batch payload for saving plan changes."""

    create: list[PlanCourse] = Field(default_factory=list, description="New plan items to create")
    update: list[PlanCourse] = Field(default_factory=list, description="Existing plan items to update")
    destroy: list[PlanCourse] = Field(default_factory=list, description="Plan items to remove")
    uniqueSessionId: str = Field(..., examples=["abc1234567890"])


# ── Registration History ─────────────────────────────────────────────────────

class Registration(BaseModel):
    """A single registration record from history."""

    courseReferenceNumber: str = Field(..., examples=["14523"])
    courseNumber: str = Field(..., examples=["1068"])
    courseDisplay: str = Field(..., examples=["CIS 1068"])
    courseTitle: str = Field(..., examples=["Program Design and Abstraction"])
    subject: str = Field(..., examples=["CIS"])
    subjectDescription: str = Field(..., examples=["Computer & Info Science"])
    sequenceNumber: str = Field(..., examples=["001"])
    creditHour: float = Field(..., examples=[4.0])
    billHour: float = Field(..., examples=[4.0])
    grade: str | None = None
    gradeMidTerm: str | None = None
    statusIndicator: str = Field(..., examples=["R"])
    statusDescription: str = Field(..., examples=["Registered"])
    courseRegistrationStatusDescription: str = Field(..., examples=["Web Registered"])
    termDescription: str = Field(..., examples=["2025 Fall"])
    campusDescription: str = Field(..., examples=["Main"])
    scheduleDescription: str = Field(..., examples=["Lecture"])
    instructionalMethodDescription: str = Field(..., examples=["Traditional"])
    gradingModeDescription: str = Field(..., examples=["Normal Grading Mode"])
    levelDescription: str = Field(..., examples=["Undergraduate"])
    partOfTermDescription: str = Field(..., examples=["Full Term"])
    startDate: str = Field(..., examples=["08/25/2025"])
    completionDate: str = Field(..., examples=["12/08/2025"])
    addDate: str = Field(..., examples=["04/15/2025"])
    registrationStatusDate: str = Field(..., examples=["04/15/2025"])
    instructorNames: list[str] = Field(default_factory=list, examples=[["John Smith"]])
    faculty: list[Faculty] = []
    meetingTimes: list[MeetingTime] = []
    term: str = Field(..., examples=["202536"])


class RegistrationHistoryData(BaseModel):
    registrations: list[Registration]
    totalCredit: str = Field(..., examples=["16"])
    totalBill: str = Field(..., examples=["16"])
    totalCeu: str = Field("0", examples=["0"])
    minHours: str = Field(..., examples=["12"])
    maxHours: str = Field(..., examples=["20"])


class RegistrationHistoryResponse(BaseModel):
    data: RegistrationHistoryData


class RegistrationEvent(BaseModel):
    """Calendar event for a registered section."""

    id: int
    title: str = Field(..., examples=["CIS 1068 - 001\nProgram Design and Abstraction"])
    start: str = Field(..., examples=["2025-09-01T09:30:00"])
    end: str = Field(..., examples=["2025-09-01T10:50:00"])
    editable: bool = False
    allDay: bool = False
    className: str = Field(..., examples=["registered-event"])
    term: str = Field(..., examples=["202536"])
    crn: str = Field(..., examples=["14523"])
    subject: str = Field(..., examples=["CIS"])
    courseNumber: str = Field(..., examples=["1068"])


class RegistrationSection(BaseModel):
    """Meeting details for a registered section."""

    billHours: float = Field(..., examples=[4.0])
    campus: str = Field(..., examples=["MN"])
    campusDescription: str = Field(..., examples=["Main"])
    courseDisplay: str = Field(..., examples=["CIS 1068"])
    courseNumber: str = Field(..., examples=["1068"])
    courseReferenceNumber: str = Field(..., examples=["14523"])
    courseTitle: str = Field(..., examples=["Program Design and Abstraction"])
    creditHours: float = Field(..., examples=[4.0])
    faculty: list[Faculty] = []
    meetingTimes: list[MeetingTime] = []
    meetingsFaculty: list[MeetingFaculty] = []
    scheduleType: str = Field(..., examples=["LEC"])
    scheduleTypeDescription: str = Field(..., examples=["Lecture"])
    sequenceNumber: str = Field(..., examples=["001"])
    subject: str = Field(..., examples=["CIS"])
    subjectCourse: str = Field(..., examples=["CIS 1068"])
    subjectDescription: str = Field(..., examples=["Computer & Info Science"])
    term: str = Field(..., examples=["202536"])
    gradingMode: str = Field(..., examples=["N"])
    gradingModeDescription: str = Field(..., examples=["Normal Grading Mode"])


# ── Class Registration (Add/Drop) ───────────────────────────────────────────

class RegPlanCourse(BaseModel):
    """A plan course as seen from the registration context."""

    activeIndicator: bool = True
    attached: bool = False
    courseDisplay: str = Field(..., examples=["CIS 1068"])
    courseNumber: str = Field(..., examples=["1068"])
    courseReferenceNumber: str = Field(..., examples=["14523"])
    courseTitle: str = Field(..., examples=["Program Design and Abstraction"])
    creditHours: float = Field(..., examples=[4.0])
    gradingMode: str = Field(..., examples=["N"])
    gradingModeDescription: str = Field(..., examples=["Normal Grading Mode"])
    instructionalMethod: str = Field(..., examples=["TR"])
    instructionalMethodDescription: str = Field(..., examples=["Traditional"])
    instructors: list[Faculty] = []
    isRegistered: bool = False
    partOfTerm: str = Field(..., examples=["1"])
    partOfTermDescription: str = Field(..., examples=["Full Term"])
    partOfTermStartDate: str = Field(..., examples=["08/25/2025"])
    partOfTermEndDate: str = Field(..., examples=["12/08/2025"])
    planNumber: int = Field(..., examples=[123])
    planStatus: str = Field(..., examples=["PLANNED"])
    scheduleType: str = Field(..., examples=["LEC"])
    scheduleTypeDescription: str = Field(..., examples=["Lecture"])
    section: str = Field(..., examples=["001"])
    sequenceNumber: int = Field(..., examples=[1])
    subject: str = Field(..., examples=["CIS"])
    term: str = Field(..., examples=["202536"])
    availableActions: list[PlanAction] = []
    authorizationRequired: bool = False
    criticalIndicator: bool = False


class RegPlanHeader(BaseModel):
    """A saved plan header with its contained courses."""

    id: int = Field(..., examples=[123])
    description: str = Field(..., examples=["Fall 2025 Plan"])
    editable: bool = True
    lastModified: str = Field(..., examples=["2025-04-01 10:30:00"])
    preferredIndicator: bool = True
    sequenceNumber: int = Field(..., examples=[1])
    sourceFormatName: str = Field(..., examples=["Student"])
    sourcePersona: str = Field(..., examples=["student"])
    term: str = Field(..., examples=["202536"])
    totalPlannedCreditHours: float = Field(..., examples=[16.0])
    totalRegisteredHours: float = Field(0, examples=[0])
    planCourses: list[RegPlanCourse] = []


class SelectPlanConfig(BaseModel):
    config: str
    display: str
    title: str
    required: bool
    width: str


class GetPlansResponse(BaseModel):
    """All saved plans available during registration."""

    plans: list[RegPlanHeader]
    selectPlanConfig: list[SelectPlanConfig] = []
    getThirdPartyData: bool = False


class AddCRNResult(BaseModel):
    """Result for a single CRN in a batch add."""

    success: bool = True
    term: str = Field(..., examples=["202536"])
    courseReferenceNumber: str = Field(..., examples=["14523"])
    model: dict = Field(default_factory=dict, description="Full RegistrationTemporaryView object")
    message: str = Field("", examples=[""])


class AddCRNRegistrationResponse(BaseModel):
    """Response from adding multiple CRNs at once."""

    aaData: list[AddCRNResult]
    anyOLR: list = Field(default_factory=list)
    anyAuthorizationRequired: list = Field(default_factory=list)


class AddRegistrationItemResponse(BaseModel):
    """Response from staging a single CRN for registration."""

    success: bool = True
    courseReferenceNumber: str = Field(..., examples=["14523"])
    model: dict = Field(
        default_factory=dict,
        description="Full RegistrationTemporaryView — pass this back in submitRegistration/batch",
    )
    message: str = Field("", examples=[""])


class SubmitRegistrationBatchPayload(BaseModel):
    """Payload for the final registration submission.

    The `update` array must contain the exact model objects returned by
    `addRegistrationItem` or `addCRNRegistrationItems`. Pass them through opaquely.
    """

    create: list[dict] = Field(default_factory=list, description="New items (rarely used)")
    update: list[dict] = Field(
        default_factory=list,
        description="Primary field — full RegistrationTemporaryView models from staging",
    )
    destroy: list[dict] = Field(default_factory=list, description="Items to drop from registration")
    uniqueSessionId: str = Field(..., examples=["abc1234567890"])


class FeeSummaryItem(BaseModel):
    code: str = Field(..., examples=["TUIT"])
    detail: str = Field(..., examples=["Tuition"])
    feeAmount: str = Field(..., examples=["$7,500.00"])
    description: str | None = None
    courseReferenceNumber: str | None = None


class CurrencyDetail(BaseModel):
    feeSummaryList: list[FeeSummaryItem]
    totalAmount: float = Field(..., examples=[7750.00])
    totalAmountFormatted: str = Field(..., examples=["$7,750.00"])
    currencyCode: str = Field("USD", examples=["USD"])
    isCurrencyValid: bool = True


class TuitionFeeData(BaseModel):
    currencies: list[CurrencyDetail]
    totalCreditHours: str = Field(..., examples=["16"])
    term: str = Field(..., examples=["202536"])


class TuitionFeeResponse(BaseModel):
    data: TuitionFeeData


# ── Contact Card ─────────────────────────────────────────────────────────────

class ContactCard(BaseModel):
    """Instructor contact information."""

    name: str = Field(..., examples=["John Smith"])
    email: str = Field(..., examples=["jsmith@temple.edu"])
    phone: str = Field("", examples=["215-204-1234"])
    office: str = Field("", examples=["SERC 358"])


# ── Term Search / Validation ─────────────────────────────────────────────────

class TermSearchResult(BaseModel):
    """Result from validating a term selection."""

    success: bool = True
    regAllowed: bool = True
    message: str = ""
    regMaxHours: int = Field(20, examples=[20])
    studentEligFailures: list = Field(default_factory=list)
