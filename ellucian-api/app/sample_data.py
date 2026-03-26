"""Realistic sample data for every endpoint, built from real HAR captures."""

from __future__ import annotations

from app.models import (
    AddCRNRegistrationResponse,
    AddCRNResult,
    AddPlanItemResponse,
    AddRegistrationItemResponse,
    CodeDescription,
    ContactCard,
    Course,
    CourseSearchResponse,
    CurrencyDetail,
    Faculty,
    FeeSummaryItem,
    GetPlansResponse,
    MeetingFaculty,
    MeetingTime,
    PlanAction,
    PlanCourse,
    PlanEvent,
    RegPlanCourse,
    RegPlanHeader,
    Registration,
    RegistrationEvent,
    RegistrationHistoryData,
    RegistrationHistoryResponse,
    RegistrationSection,
    Section,
    SectionAttribute,
    SectionSearchResponse,
    TermSearchResult,
    TuitionFeeData,
    TuitionFeeResponse,
)

# ── Shared building blocks ───────────────────────────────────────────────────

TERMS = [
    CodeDescription(code="202603", description="2026 Spring"),
    CodeDescription(code="202536", description="2025 Fall"),
    CodeDescription(code="202503", description="2025 Spring"),
    CodeDescription(code="202436", description="2024 Fall"),
    CodeDescription(code="202403", description="2024 Spring"),
]

SUBJECTS = [
    CodeDescription(code="CIS", description="Computer & Info Science"),
    CodeDescription(code="MATH", description="Mathematics"),
    CodeDescription(code="PHYS", description="Physics"),
    CodeDescription(code="ENGL", description="English"),
    CodeDescription(code="STAT", description="Statistics"),
]

COLLEGES = [
    CodeDescription(code="ST", description="Science & Technology"),
    CodeDescription(code="LA", description="Liberal Arts"),
    CodeDescription(code="BU", description="Fox School of Business"),
    CodeDescription(code="EN", description="Engineering"),
]

DIVISIONS = [
    CodeDescription(code="UG", description="Undergraduate"),
    CodeDescription(code="GR", description="Graduate"),
]

ATTRIBUTES = [
    CodeDescription(code="GSST", description="GenEd: Science & Technology"),
    CodeDescription(code="GQRA", description="GenEd: Quantitative Reasoning A"),
    CodeDescription(code="GWRT", description="GenEd: Writing Intensive"),
]

FACULTY_SMITH = Faculty(
    bannerId="912345678",
    courseReferenceNumber="14523",
    displayName="John Smith",
    emailAddress="jsmith@temple.edu",
    primaryIndicator=True,
    term="202536",
)

FACULTY_DOE = Faculty(
    bannerId="912345679",
    courseReferenceNumber="14524",
    displayName="Jane Doe",
    emailAddress="jdoe@temple.edu",
    primaryIndicator=True,
    term="202536",
)

MT_MW = MeetingTime(
    beginTime="0930",
    endTime="1050",
    building="SERC",
    buildingDescription="Science Ed & Research Ctr",
    campus="MN",
    campusDescription="Main",
    room="116",
    creditHourSession=4.0,
    hoursWeek=2.67,
    meetingType="LEC",
    meetingTypeDescription="Lecture",
    startDate="08/25/2025",
    endDate="12/08/2025",
    monday=True,
    wednesday=True,
)

MT_TR = MeetingTime(
    beginTime="1300",
    endTime="1420",
    building="TUTTL",
    buildingDescription="Tuttleman Learning Ctr",
    campus="MN",
    campusDescription="Main",
    room="201",
    creditHourSession=3.0,
    hoursWeek=2.67,
    meetingType="LEC",
    meetingTypeDescription="Lecture",
    startDate="08/25/2025",
    endDate="12/08/2025",
    tuesday=True,
    thursday=True,
)

MT_LAB = MeetingTime(
    beginTime="1500",
    endTime="1650",
    building="SERC",
    buildingDescription="Science Ed & Research Ctr",
    campus="MN",
    campusDescription="Main",
    room="204",
    creditHourSession=0.0,
    hoursWeek=1.67,
    meetingType="LAB",
    meetingTypeDescription="Lab",
    startDate="08/25/2025",
    endDate="12/08/2025",
    friday=True,
)

MF_MW = MeetingFaculty(category="01", courseReferenceNumber="14523", meetingTime=MT_MW, term="202536")
MF_TR = MeetingFaculty(category="01", courseReferenceNumber="14524", meetingTime=MT_TR, term="202536")
MF_LAB = MeetingFaculty(category="02", courseReferenceNumber="14523", meetingTime=MT_LAB, term="202536")


# ── Course Search ────────────────────────────────────────────────────────────

COURSES = [
    Course(
        id=1,
        termEffective="202536",
        courseNumber="1068",
        courseDisplay="CIS 1068",
        subject="Computer & Info Science",
        subjectCode="CIS",
        college="Science & Technology",
        collegeCode="ST",
        department="Computer & Information Sciences",
        departmentCode="CIS",
        courseTitle="Program Design and Abstraction",
        creditHourLow=4.0,
        subjectDescription="Computer & Info Science",
        courseDescription="Introduction to programming and problem solving using Java.",
        division="Undergraduate",
        termStart="202536",
        termEnd="999999",
        preRequisiteCheckMethodCde="Y",
    ),
    Course(
        id=2,
        termEffective="202536",
        courseNumber="2168",
        courseDisplay="CIS 2168",
        subject="Computer & Info Science",
        subjectCode="CIS",
        college="Science & Technology",
        collegeCode="ST",
        department="Computer & Information Sciences",
        departmentCode="CIS",
        courseTitle="Data Structures",
        creditHourLow=4.0,
        subjectDescription="Computer & Info Science",
        courseDescription="Design and implementation of fundamental data structures.",
        division="Undergraduate",
        termStart="202536",
        termEnd="999999",
        preRequisiteCheckMethodCde="Y",
    ),
    Course(
        id=3,
        termEffective="202536",
        courseNumber="1057",
        courseDisplay="MATH 1057",
        subject="Mathematics",
        subjectCode="MATH",
        college="Science & Technology",
        collegeCode="ST",
        department="Mathematics",
        departmentCode="MATH",
        courseTitle="Calculus II",
        creditHourLow=4.0,
        subjectDescription="Mathematics",
        courseDescription="Techniques of integration, applications of the integral.",
        division="Undergraduate",
        termStart="202536",
        termEnd="999999",
        preRequisiteCheckMethodCde="Y",
    ),
]

COURSE_SEARCH_RESPONSE = CourseSearchResponse(
    totalCount=3,
    data=COURSES,
    coursesFetchedCount=3,
)


# ── Sections ─────────────────────────────────────────────────────────────────

SECTIONS = [
    Section(
        id=1,
        term="202536",
        termDesc="2025 Fall",
        courseReferenceNumber="14523",
        partOfTerm="1",
        courseNumber="1068",
        courseDisplay="CIS 1068",
        subject="CIS",
        subjectDescription="Computer & Info Science",
        sequenceNumber="001",
        campusDescription="Main",
        scheduleTypeDescription="Lecture",
        courseTitle="Program Design and Abstraction",
        creditHourLow=4.0,
        maximumEnrollment=30,
        enrollment=28,
        seatsAvailable=2,
        waitCapacity=5,
        waitAvailable=5,
        subjectCourse="CIS 1068",
        faculty=[FACULTY_SMITH],
        meetingsFaculty=[MF_MW, MF_LAB],
        instructionalMethod="TR",
        instructionalMethodDescription="Traditional",
        sectionAttributes=[SectionAttribute(code="GSST", description="GenEd: Science & Technology")],
    ),
    Section(
        id=2,
        term="202536",
        termDesc="2025 Fall",
        courseReferenceNumber="14524",
        partOfTerm="1",
        courseNumber="2168",
        courseDisplay="CIS 2168",
        subject="CIS",
        subjectDescription="Computer & Info Science",
        sequenceNumber="001",
        campusDescription="Main",
        scheduleTypeDescription="Lecture",
        courseTitle="Data Structures",
        creditHourLow=4.0,
        maximumEnrollment=35,
        enrollment=33,
        seatsAvailable=2,
        waitCapacity=5,
        waitAvailable=5,
        subjectCourse="CIS 2168",
        faculty=[FACULTY_DOE],
        meetingsFaculty=[MF_TR],
        instructionalMethod="TR",
        instructionalMethodDescription="Traditional",
    ),
]

SECTION_SEARCH_RESPONSE = SectionSearchResponse(
    totalCount=2,
    data=SECTIONS,
    sectionsFetchedCount=2,
)


# ── Plan Ahead ───────────────────────────────────────────────────────────────

PLAN_COURSES = [
    PlanCourse(
        courseDisplay="CIS 1068",
        courseNumber="1068",
        courseReferenceNumber="14523",
        courseTitle="Program Design and Abstraction",
        creditHours=4.0,
        gradingMode="N",
        gradingModeDescription="Normal Grading Mode",
        instructionalMethod="TR",
        instructionalMethodDescription="Traditional",
        partOfTerm="1",
        partOfTermDescription="Full Term",
        partOfTermStartDate="08/25/2025",
        partOfTermEndDate="12/08/2025",
        planStatus="PLANNED",
        scheduleType="LEC",
        scheduleTypeDescription="Lecture",
        subject="CIS",
        term="202536",
        section="001",
        availableActions=[PlanAction(description="Remove", isDeleteAction=True, planCourseStatus="PLANNED")],
    ),
]

ADD_PLAN_ITEM_RESPONSE = AddPlanItemResponse(model=PLAN_COURSES[0])

PLAN_EVENTS = [
    PlanEvent(
        courseReferenceNumber="14523",
        courseNumber="1068",
        courseTitle="Program Design and Abstraction",
        subject="CIS",
        creditHours=4.0,
        term="202536",
        section="001",
        meetingTime=MT_MW,
        faculty=[FACULTY_SMITH],
        category="01",
    ),
]


# ── Registration History ─────────────────────────────────────────────────────

REG_HISTORY_RESPONSE = RegistrationHistoryResponse(
    data=RegistrationHistoryData(
        registrations=[
            Registration(
                courseReferenceNumber="14523",
                courseNumber="1068",
                courseDisplay="CIS 1068",
                courseTitle="Program Design and Abstraction",
                subject="CIS",
                subjectDescription="Computer & Info Science",
                sequenceNumber="001",
                creditHour=4.0,
                billHour=4.0,
                statusIndicator="R",
                statusDescription="Registered",
                courseRegistrationStatusDescription="Web Registered",
                termDescription="2025 Fall",
                campusDescription="Main",
                scheduleDescription="Lecture",
                instructionalMethodDescription="Traditional",
                gradingModeDescription="Normal Grading Mode",
                levelDescription="Undergraduate",
                partOfTermDescription="Full Term",
                startDate="08/25/2025",
                completionDate="12/08/2025",
                addDate="04/15/2025",
                registrationStatusDate="04/15/2025",
                instructorNames=["John Smith"],
                term="202536",
            ),
        ],
        totalCredit="16",
        totalBill="16",
        minHours="12",
        maxHours="20",
    ),
)

REG_EVENTS = [
    RegistrationEvent(
        id=1,
        title="CIS 1068 - 001\nProgram Design and Abstraction",
        start="2025-09-01T09:30:00",
        end="2025-09-01T10:50:00",
        className="registered-event",
        term="202536",
        crn="14523",
        subject="CIS",
        courseNumber="1068",
    ),
]

REG_SECTIONS = [
    RegistrationSection(
        billHours=4.0,
        campus="MN",
        campusDescription="Main",
        courseDisplay="CIS 1068",
        courseNumber="1068",
        courseReferenceNumber="14523",
        courseTitle="Program Design and Abstraction",
        creditHours=4.0,
        scheduleType="LEC",
        scheduleTypeDescription="Lecture",
        sequenceNumber="001",
        subject="CIS",
        subjectCourse="CIS 1068",
        subjectDescription="Computer & Info Science",
        term="202536",
        gradingMode="N",
        gradingModeDescription="Normal Grading Mode",
        meetingsFaculty=[MF_MW],
    ),
]


# ── Class Registration ───────────────────────────────────────────────────────

REG_PLAN_COURSES = [
    RegPlanCourse(
        courseDisplay="CIS 1068",
        courseNumber="1068",
        courseReferenceNumber="14523",
        courseTitle="Program Design and Abstraction",
        creditHours=4.0,
        gradingMode="N",
        gradingModeDescription="Normal Grading Mode",
        instructionalMethod="TR",
        instructionalMethodDescription="Traditional",
        partOfTerm="1",
        partOfTermDescription="Full Term",
        partOfTermStartDate="08/25/2025",
        partOfTermEndDate="12/08/2025",
        planNumber=1,
        planStatus="PLANNED",
        scheduleType="LEC",
        scheduleTypeDescription="Lecture",
        section="001",
        sequenceNumber=1,
        subject="CIS",
        term="202536",
    ),
    RegPlanCourse(
        courseDisplay="CIS 2168",
        courseNumber="2168",
        courseReferenceNumber="14524",
        courseTitle="Data Structures",
        creditHours=4.0,
        gradingMode="N",
        gradingModeDescription="Normal Grading Mode",
        instructionalMethod="TR",
        instructionalMethodDescription="Traditional",
        partOfTerm="1",
        partOfTermDescription="Full Term",
        partOfTermStartDate="08/25/2025",
        partOfTermEndDate="12/08/2025",
        planNumber=1,
        planStatus="PLANNED",
        scheduleType="LEC",
        scheduleTypeDescription="Lecture",
        section="001",
        sequenceNumber=2,
        subject="CIS",
        term="202536",
    ),
]

GET_PLANS_RESPONSE = GetPlansResponse(
    plans=[
        RegPlanHeader(
            id=1,
            description="Fall 2025 Plan",
            lastModified="2025-04-01 10:30:00",
            sequenceNumber=1,
            sourceFormatName="Student",
            sourcePersona="student",
            term="202536",
            totalPlannedCreditHours=8.0,
            planCourses=REG_PLAN_COURSES,
        ),
    ],
)

SAMPLE_REG_TEMP_VIEW = {
    "courseReferenceNumber": "14523",
    "term": "202536",
    "courseNumber": "1068",
    "subject": "CIS",
    "subjectDescription": "Computer & Info Science",
    "courseTitle": "Program Design and Abstraction",
    "campusDescription": "Main",
    "scheduleTypeDescription": "Lecture",
    "creditHours": 4,
    "maximumEnrollment": 30,
    "enrollment": 28,
    "seatsAvailable": 2,
    "statusDescription": "Pending",
    "statusIndicator": "P",
    "gradingMode": "N",
    "gradingModeDescription": "Normal Grading Mode",
}

ADD_CRN_RESPONSE = AddCRNRegistrationResponse(
    aaData=[
        AddCRNResult(term="202536", courseReferenceNumber="14523", model=SAMPLE_REG_TEMP_VIEW),
        AddCRNResult(term="202536", courseReferenceNumber="14524", model=SAMPLE_REG_TEMP_VIEW),
    ],
)

ADD_ITEM_RESPONSE = AddRegistrationItemResponse(
    courseReferenceNumber="14523",
    model=SAMPLE_REG_TEMP_VIEW,
)

TUITION_FEE_RESPONSE = TuitionFeeResponse(
    data=TuitionFeeData(
        currencies=[
            CurrencyDetail(
                feeSummaryList=[
                    FeeSummaryItem(code="TUIT", detail="Tuition", feeAmount="$7,500.00"),
                    FeeSummaryItem(code="TECH", detail="Technology Fee", feeAmount="$250.00"),
                    FeeSummaryItem(code="TRNS", detail="Transportation Fee", feeAmount="$230.00"),
                    FeeSummaryItem(code="STAC", detail="Student Activity Fee", feeAmount="$100.00"),
                ],
                totalAmount=8080.00,
                totalAmountFormatted="$8,080.00",
            ),
        ],
        totalCreditHours="16",
        term="202536",
    ),
)

TERM_SEARCH_RESULT = TermSearchResult()

CONTACT_CARD = ContactCard(
    name="John Smith",
    email="jsmith@temple.edu",
    phone="215-204-1234",
    office="SERC 358",
)

SECTION_DETAILS_CRN = {
    "courseReferenceNumber": "14523",
    "term": "202536",
    "courseNumber": "1068",
    "subject": "CIS",
    "subjectDescription": "Computer & Info Science",
    "courseTitle": "Program Design and Abstraction",
    "sequenceNumber": "001",
    "campusDescription": "Main",
    "scheduleTypeDescription": "Lecture",
    "creditHours": 4,
    "maximumEnrollment": 30,
    "enrollment": 28,
    "seatsAvailable": 2,
    "openSection": True,
    "faculty": [FACULTY_SMITH.model_dump()],
    "meetingsFaculty": [MF_MW.model_dump()],
}
