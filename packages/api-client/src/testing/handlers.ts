/**
 * The API's happy path for tests: every operation answers with a small,
 * valid response typed by the generated client. Tests override only what
 * they need with `server.use()`.
 */
import { http, HttpResponse } from "msw/http";
import type {
  GenerateSchedulesResponse,
  GetCourseDescriptionResponse,
  GetMeResponse,
  GetProgramRequirementsResponse,
  ListBulletinProgramsResponse,
  ListBulletinSubjectsResponse,
  ListAttributesResponse,
  ListCampusesResponse,
  ListPartsOfTermResponse,
  ListSeatWatchesResponse,
  ListSubjectCoursesResponse,
  ListSubjectsResponse,
  ListTermsResponse,
  ParseAuditResponse,
  ParseBulletinResponse,
  ParseTranscriptPdfResponse,
  SearchProfessorsResponse,
  SearchSectionsResponse,
} from "../generated/types.gen";

/** Any origin: the web app, the extension and the client tests each use their own. */
export const API = "*/api";

export const FETCHED_AT = "2026-10-17T12:00:00.000Z";

const TERMS: ListTermsResponse = {
  terms: [{ code: "202703", description: "2027 Spring" }],
};

const SUBJECTS: ListSubjectsResponse = {
  subjects: [{ code: "CIS", description: "Computer & Information Science" }],
};

const USER: GetMeResponse = {
  id: "user-1",
  email: "student@temple.edu",
  name: "Test Student",
  pictureUrl: "",
};

const AUDIT: ParseAuditResponse = {
  studentName: "Test Student",
  programCode: "CIS-BS",
  programTitle: "Computer Science, BS",
  catalogYear: "2025",
  preparedOn: FETCHED_AT,
  graduationDate: "",
  complete: null,
  analysisComplete: true,
  degreeTotals: null,
  categoryTotals: [],
  requirements: [],
};

const BULLETIN: ParseBulletinResponse = {
  name: "Computer Science, BS",
  programCode: "CIS-BS",
  degreeType: "BS",
  college: "College of Science and Technology",
  level: "Undergraduate",
  breadcrumb: [],
  campus: "Main",
  bulletinYear: "2025-2026",
  bulletinUrl: "https://bulletin.temple.edu/",
  pdfUrl: "",
  programPageUrl: "",
  archiveNotice: "",
  appliesTo: "",
  totalCredits: "123",
  tabs: [],
  overview: [],
  facts: [],
  categories: [],
  labScienceTitle: "",
  labScienceSequences: [],
  suggestedPlan: null,
  suggestedPlans: [],
  distinctionCriteria: [],
  footnotes: [],
  contacts: [],
  acceleratedPrograms: [],
  sections: [],
};

/** The Computer Science BS page, the program these tests pick. */
export const PROGRAM_URL =
  "https://bulletin.temple.edu/undergraduate/science-technology/computer-science-bs/";

function bulletinPrograms(year: string): ListBulletinProgramsResponse {
  return {
    bulletinYear: year,
    requestedYear: year,
    sourceUrl: `https://bulletin.temple.edu/archives/${year}/academic-programs/`,
    programs: [
      {
        name: "Computer Science",
        degree: "BA",
        note: "",
        level: "undergraduate",
        college: "ST",
        collegeName: "College of Science & Technology",
        degreeName: "Bachelor of Arts",
        hasOptions: false,
        url: PROGRAM_URL.replace("-bs/", "-ba/"),
      },
      {
        name: "Computer Science",
        degree: "BS",
        note: "",
        level: "undergraduate",
        college: "ST",
        collegeName: "College of Science & Technology",
        degreeName: "Bachelor of Science",
        hasOptions: false,
        url: PROGRAM_URL,
      },
    ],
    colleges: [{ code: "ST", name: "College of Science & Technology" }],
    degrees: [],
    programTypes: [],
    introduction: [],
    links: [],
  };
}

const COURSE: GetCourseDescriptionResponse = {
  code: "CIS 3296",
  title: "Software Design",
  credits: "4",
  description: "",
  attributes: ["WI"],
  repeatability: "",
  prerequisites: "Minimum grade of C- in CIS 2168",
  corequisites: "",
  prerequisiteCourses: ["CIS 2168"],
  corequisiteCourses: [],
  restrictions: [],
  other: [],
  bulletinUrl: "https://bulletin.temple.edu/search/?P=CIS%203296",
};

function bulletinSubjects(year: string): ListBulletinSubjectsResponse {
  return {
    bulletinYear: year,
    requestedYear: year,
    sourceUrl: `https://bulletin.temple.edu/archives/${year}/courses/`,
    subjects: [
      { code: "CIS", name: "Computer & Information Science" },
      { code: "MATH", name: "Mathematics" },
    ],
  };
}

function subjectCourses(
  subject: string,
  year: string,
): ListSubjectCoursesResponse {
  const course = (number: string, title: string, credits: string) => ({
    ...COURSE,
    code: `${subject} ${number}`,
    title,
    credits,
    attributes: [],
    bulletinUrl: `https://bulletin.temple.edu/archives/${year}/search/?P=${subject}%20${number}`,
  });
  return {
    bulletinYear: year,
    subject,
    sourceUrl: `https://bulletin.temple.edu/archives/${year}/courses/${subject.toLowerCase()}/`,
    courses:
      subject === "CIS"
        ? [
            course(
              "1051",
              "Introduction to Problem Solving and Programming in Python",
              "4",
            ),
            course("3296", "Software Design", "4"),
            course("5015", "Data Structures and Algorithms", "3"),
          ]
        : [course("1041", "Calculus I", "4")],
  };
}

const REQUIREMENTS: GetProgramRequirementsResponse = {
  ...BULLETIN,
  name: "Computer Science BS",
  bulletinUrl: PROGRAM_URL,
};

export const handlers = [
  http.get<never, never, GetMeResponse>(`${API}/users/me`, () =>
    HttpResponse.json(USER),
  ),
  http.delete(
    `${API}/auth/session`,
    () => new HttpResponse(null, { status: 204 }),
  ),
  http.post(`${API}/advisor\\:chat`, () => {
    const events = [
      { type: "start", messageId: "reply" },
      { type: "text-start", id: "text" },
      { type: "text-delta", id: "text", delta: "Here's what I found." },
      { type: "text-end", id: "text" },
      { type: "finish", finishReason: "stop" },
    ];
    return new HttpResponse(
      events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") +
        "data: [DONE]\n\n",
      { headers: { "Content-Type": "text/event-stream" } },
    );
  }),
  http.get<never, never, ListTermsResponse>(`${API}/classes/terms`, () =>
    HttpResponse.json(TERMS),
  ),
  http.get<never, never, ListSubjectsResponse>(
    `${API}/classes/terms/:term/subjects`,
    () => HttpResponse.json(SUBJECTS),
  ),
  http.get<never, never, ListAttributesResponse>(
    `${API}/classes/terms/:term/attributes`,
    () => HttpResponse.json({ attributes: [] }),
  ),
  http.get<never, never, ListCampusesResponse>(
    `${API}/classes/terms/:term/campuses`,
    () => HttpResponse.json({ campuses: [] }),
  ),
  http.get<never, never, ListPartsOfTermResponse>(
    `${API}/classes/terms/:term/parts-of-term`,
    () => HttpResponse.json({ partsOfTerm: [] }),
  ),
  http.get<never, never, SearchSectionsResponse>(
    `${API}/classes/terms/:term/sections`,
    () =>
      HttpResponse.json({
        totalCount: 0,
        sections: [],
        fetchedAt: FETCHED_AT,
        nextCursor: null,
      }),
  ),
  http.post<never, never, ParseAuditResponse>(
    `${API}/dars/audits\\:parse`,
    () => HttpResponse.json(AUDIT),
  ),
  http.post<never, never, ParseBulletinResponse>(
    `${API}/bulletins/program-requirements\\:parse`,
    () => HttpResponse.json(BULLETIN),
  ),
  http.get<{ year: string }, never, ListBulletinProgramsResponse>(
    `${API}/bulletins/:year/programs`,
    ({ params }) => HttpResponse.json(bulletinPrograms(params.year)),
  ),
  http.get<{ year: string }, never, ListBulletinSubjectsResponse>(
    `${API}/bulletins/:year/subjects`,
    ({ params }) => HttpResponse.json(bulletinSubjects(params.year)),
  ),
  http.get<
    { year: string; subject: string },
    never,
    ListSubjectCoursesResponse
  >(`${API}/bulletins/:year/subjects/:subject/courses`, ({ params }) =>
    HttpResponse.json(subjectCourses(params.subject, params.year)),
  ),
  http.get<never, never, GetCourseDescriptionResponse>(
    `${API}/bulletins/:year/subjects/:subject/courses/:number`,
    () => HttpResponse.json(COURSE),
  ),
  http.get<never, never, GetProgramRequirementsResponse>(
    `${API}/bulletins/program-requirements`,
    () => HttpResponse.json(REQUIREMENTS),
  ),
  http.get<never, never, SearchProfessorsResponse>(`${API}/professors`, () =>
    HttpResponse.json({ professors: [] }),
  ),
  http.get<never, never, ListSeatWatchesResponse>(`${API}/seat-watches`, () =>
    HttpResponse.json({ seatWatches: [] }),
  ),
  http.post<never, never, GenerateSchedulesResponse>(
    `${API}/schedules\\:generate`,
    () => HttpResponse.json({ schedules: [] }),
  ),
  http.post<never, never, ParseTranscriptPdfResponse>(
    `${API}/transcripts\\:parse`,
    () =>
      HttpResponse.json({
        courses: [],
        gpa: null,
        institution: null,
        program: {},
        periods: [],
        totals: [],
        diagnostics: [],
      }),
  ),
];
