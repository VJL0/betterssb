/**
 * The API's happy path for tests: every operation answers with a small,
 * valid response typed by the generated client. Tests override only what
 * they need with `server.use()`.
 */
import { http, HttpResponse } from "msw/http";
import type {
  CheckPrerequisitesResponse,
  GenerateSchedulesResponse,
  GetCourseDescriptionResponse,
  GetMeResponse,
  GetProgramRequirementsResponse,
  ListBulletinProgramsResponse,
  ListBulletinSubjectsResponse,
  ListAttributesResponse,
  ListCampusesResponse,
  ListPartsOfTermResponse,
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

const TERMS: ListTermsResponse = [
  { code: "202703", description: "2027 Spring" },
];

const SUBJECTS: ListSubjectsResponse = [
  { code: "CIS", description: "Computer & Information Science" },
];

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
  http.get<never, never, GetMeResponse>(`${API}/auth/me`, () =>
    HttpResponse.json(USER),
  ),
  http.post(
    `${API}/auth/logout`,
    () => new HttpResponse(null, { status: 204 }),
  ),
  http.post(`${API}/chat`, () => {
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
  http.get<never, never, ListSubjectsResponse>(`${API}/classes/subjects`, () =>
    HttpResponse.json(SUBJECTS),
  ),
  http.get<never, never, ListAttributesResponse>(
    `${API}/classes/attributes`,
    () => HttpResponse.json([]),
  ),
  http.get<never, never, ListCampusesResponse>(`${API}/classes/campuses`, () =>
    HttpResponse.json([]),
  ),
  http.get<never, never, ListPartsOfTermResponse>(
    `${API}/classes/parts-of-term`,
    () => HttpResponse.json([]),
  ),
  http.get<never, never, SearchSectionsResponse>(`${API}/classes/search`, () =>
    HttpResponse.json({ totalCount: 0, sections: [], fetchedAt: FETCHED_AT }),
  ),
  http.post<never, never, ParseAuditResponse>(`${API}/dars/audits/parse`, () =>
    HttpResponse.json(AUDIT),
  ),
  http.post<never, never, ParseBulletinResponse>(
    `${API}/degree/parse-bulletin`,
    () => HttpResponse.json(BULLETIN),
  ),
  http.get<never, never, ListBulletinProgramsResponse>(
    `${API}/degree/programs`,
    ({ request }) =>
      HttpResponse.json(
        bulletinPrograms(new URL(request.url).searchParams.get("year") ?? ""),
      ),
  ),
  http.get<never, never, ListBulletinSubjectsResponse>(
    `${API}/degree/subjects`,
    ({ request }) =>
      HttpResponse.json(
        bulletinSubjects(new URL(request.url).searchParams.get("year") ?? ""),
      ),
  ),
  http.get<{ subject: string }, never, ListSubjectCoursesResponse>(
    `${API}/degree/subjects/:subject/courses`,
    ({ params, request }) =>
      HttpResponse.json(
        subjectCourses(
          params.subject,
          new URL(request.url).searchParams.get("year") ?? "",
        ),
      ),
  ),
  http.get<never, never, GetCourseDescriptionResponse>(
    `${API}/degree/courses`,
    () => HttpResponse.json(COURSE),
  ),
  http.get<never, never, GetProgramRequirementsResponse>(
    `${API}/degree/requirements`,
    () => HttpResponse.json(REQUIREMENTS),
  ),
  http.get<never, never, SearchProfessorsResponse>(`${API}/rmp/search`, () =>
    HttpResponse.json([]),
  ),
  http.post<never, never, GenerateSchedulesResponse>(
    `${API}/schedule/generate`,
    () => HttpResponse.json([]),
  ),
  http.post<never, never, CheckPrerequisitesResponse>(
    `${API}/transcript/check-prereqs`,
    () => HttpResponse.json({}),
  ),
  http.post<never, never, ParseTranscriptPdfResponse>(
    `${API}/transcript/parse-pdf`,
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
