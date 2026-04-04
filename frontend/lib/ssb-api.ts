/**
 * Client for the Ellucian Self-Service Banner (SSB) JSON API.
 *
 * All requests run from the content script or background script with the
 * user's existing session cookies — no separate auth is needed.  The SSB
 * server requires an `X-Synchronizer-Token` CSRF header on every XHR; we
 * extract it from the page on first use.
 */

import type {
  SSBTerm,
  SSBSubject,
  SSBCollege,
  SSBDivision,
  SSBAttribute,
  SSBCourseSearchParams,
  SSBCourseSearchResponse,
  SSBSectionSearchParams,
  SSBSectionSearchResponse,
  SSBMeetingFaculty,
  SSBAddPlanItemResponse,
  SSBPlanBatchPayload,
  SSBRegistrationHistoryResponse,
  SSBRegistrationEvent,
  SSBRegistrationSection,
  SSBGetPlansResponse,
  SSBAddCRNRegistrationResponse,
  SSBAddRegistrationItemResponse,
  SSBTuitionFeeResponse,
  SSBSubmitRegistrationBatchPayload,
} from "@/types/ssb";

const SSB_BASE = "/StudentRegistrationSsb/ssb";

let _syncToken: string | null = null;
let _uniqueSessionId: string | null = null;

function readSyncTokenFromDOM(): string {
  const meta = document.querySelector<HTMLMetaElement>(
    'meta[name="synchronizerToken"]',
  );
  if (meta?.content) return meta.content;

  const input = document.querySelector<HTMLInputElement>(
    'input[name="synchronizerToken"]',
  );
  if (input?.value) return input.value;

  const bodyText = document.body?.innerHTML ?? "";
  const match = bodyText.match(/synchronizerToken[^"]*"([0-9a-f-]{36})"/);
  if (match) return match[1];

  return "";
}

function syncToken(): string {
  if (_syncToken) return _syncToken;
  _syncToken = readSyncTokenFromDOM();
  return _syncToken;
}

function invalidateSyncToken(): void {
  _syncToken = null;
}

/**
 * After term/search the server issues a new synchronizer token, served in
 * the HTML of the classRegistration page the browser navigates to. We fetch
 * that page and extract the token so subsequent XHR calls authenticate.
 */
async function refreshSyncTokenFromPage(): Promise<void> {
  const url = `${SSB_BASE}/classRegistration/classRegistration`;
  const res = await fetch(url, { credentials: "same-origin" });
  if (!res.ok) return;

  const html = await res.text();
  const match = html.match(
    /name\s*=\s*"synchronizerToken"\s+content\s*=\s*"([0-9a-f-]{36})"/,
  );
  if (match) {
    _syncToken = match[1];
    return;
  }
  const altMatch = html.match(
    /synchronizerToken[^"]*"([0-9a-f-]{36})"/,
  );
  if (altMatch) {
    _syncToken = altMatch[1];
  }
}

function sessionId(): string {
  if (_uniqueSessionId) return _uniqueSessionId;
  _uniqueSessionId =
    Math.random().toString(36).slice(2, 7) + Date.now().toString();
  return _uniqueSessionId;
}

function cacheBuster(): string {
  return Date.now().toString();
}

async function ssbGet<T>(
  path: string,
  params: Record<string, string> = {},
): Promise<T> {
  const url = new URL(`${SSB_BASE}${path}`, window.location.origin);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") url.searchParams.set(k, v);
  }
  url.searchParams.set("_", cacheBuster());

  const res = await fetch(url.toString(), {
    credentials: "same-origin",
    headers: {
      Accept: "application/json, text/javascript, */*; q=0.01",
      "X-Requested-With": "XMLHttpRequest",
      "X-Synchronizer-Token": syncToken(),
    },
  });

  if (!res.ok) throw new Error(`SSB GET ${path} failed: ${res.status}`);
  return res.json();
}

async function ssbPost<T>(
  path: string,
  body: Record<string, string>,
): Promise<T> {
  const res = await fetch(`${SSB_BASE}${path}`, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      Accept: "text/html, */*; q=0.01",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      "X-Synchronizer-Token": syncToken(),
    },
    body: new URLSearchParams(body).toString(),
  });

  if (!res.ok) throw new Error(`SSB POST ${path} failed: ${res.status}`);

  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) return res.json();
  return (await res.text()) as unknown as T;
}

// ── Lookup endpoints (dropdowns) ────────────────────────────────────────────

export async function getTerms(
  searchTerm = "",
  offset = 1,
  max = 10,
): Promise<SSBTerm[]> {
  return ssbGet("/courseSearch/getTerms", {
    searchTerm,
    offset: String(offset),
    max: String(max),
  });
}

export async function getSubjects(
  term: string,
  searchTerm = "",
  offset = 1,
  max = 500,
): Promise<SSBSubject[]> {
  return ssbGet("/courseSearch/get_subject", {
    searchTerm,
    term,
    offset: String(offset),
    max: String(max),
    uniqueSessionId: sessionId(),
  });
}

export async function getColleges(
  term: string,
  searchTerm = "",
  offset = 1,
  max = 50,
): Promise<SSBCollege[]> {
  return ssbGet("/courseSearch/get_college", {
    searchTerm,
    term,
    offset: String(offset),
    max: String(max),
    uniqueSessionId: sessionId(),
  });
}

export async function getDivisions(
  term: string,
  searchTerm = "",
): Promise<SSBDivision[]> {
  return ssbGet("/courseSearch/get_division", {
    searchTerm,
    term,
    offset: "1",
    max: "10",
    uniqueSessionId: sessionId(),
  });
}

export async function getAttributes(
  term: string,
  searchTerm = "",
): Promise<SSBAttribute[]> {
  return ssbGet("/courseSearch/get_attribute", {
    searchTerm,
    term,
    offset: "1",
    max: "100",
    uniqueSessionId: sessionId(),
  });
}

// ── Course catalog search ───────────────────────────────────────────────────

export async function searchCourses(
  params: SSBCourseSearchParams,
): Promise<SSBCourseSearchResponse> {
  const qs: Record<string, string> = {
    txt_term: params.txt_term,
    startDatepicker: "",
    endDatepicker: "",
    uniqueSessionId: sessionId(),
    pageOffset: String(params.pageOffset ?? 0),
    pageMaxSize: String(params.pageMaxSize ?? 50),
    sortColumn: params.sortColumn ?? "subjectDescription",
    sortDirection: params.sortDirection ?? "asc",
  };

  if (params.txt_subject) qs.txt_subject = params.txt_subject;
  if (params.txt_college) qs.txt_college = params.txt_college;
  if (params.txt_division) qs.txt_division = params.txt_division;
  if (params.txt_attribute) qs.txt_attribute = params.txt_attribute;
  if (params.txt_keywordall) qs.txt_keywordall = params.txt_keywordall;
  if (params.txt_courseTitle) qs.txt_courseTitle = params.txt_courseTitle;
  if (params.txt_course_number_range_From)
    qs.txt_course_number_range_From = params.txt_course_number_range_From;
  if (params.txt_course_number_range_To)
    qs.txt_course_number_range_To = params.txt_course_number_range_To;
  if (params.txt_credithourlow) qs.txt_credithourlow = params.txt_credithourlow;
  if (params.txt_credithourhigh)
    qs.txt_credithourhigh = params.txt_credithourhigh;

  return ssbGet("/courseSearchResults/courseSearchResults", qs);
}

// ── Section search (specific course sections with meeting times) ────────────

export async function searchSections(
  params: SSBSectionSearchParams,
): Promise<SSBSectionSearchResponse> {
  const qs: Record<string, string> = {
    txt_term: params.txt_term,
    pageOffset: String(params.pageOffset ?? 0),
    pageMaxSize: String(params.pageMaxSize ?? 50),
    sortColumn: params.sortColumn ?? "subjectDescription",
    sortDirection: params.sortDirection ?? "asc",
  };

  if (params.txt_subjectcoursecombo)
    qs.txt_subjectcoursecombo = params.txt_subjectcoursecombo;
  if (params.txt_subject) qs.txt_subject = params.txt_subject;
  if (params.txt_courseNumber) qs.txt_courseNumber = params.txt_courseNumber;
  if (params.txt_college) qs.txt_college = params.txt_college;
  if (params.txt_division) qs.txt_division = params.txt_division;

  return ssbGet("/searchResults/searchResults", qs);
}

// ── Section detail endpoints (POST with form-encoded body) ──────────────────

export async function getClassDetails(
  term: string,
  crn: string,
): Promise<string> {
  return ssbPost("/searchResults/getClassDetails", {
    term,
    courseReferenceNumber: crn,
    first: "first",
  });
}

export async function getCourseDescription(
  term: string,
  crn: string,
): Promise<string> {
  return ssbPost("/searchResults/getCourseDescription", {
    term,
    courseReferenceNumber: crn,
  });
}

export async function getEnrollmentInfo(
  term: string,
  crn: string,
): Promise<string> {
  return ssbPost("/searchResults/getEnrollmentInfo", {
    term,
    courseReferenceNumber: crn,
  });
}

export async function getFacultyMeetingTimes(
  term: string,
  crn: string,
): Promise<SSBMeetingFaculty[]> {
  return ssbGet("/searchResults/getFacultyMeetingTimes", {
    term,
    courseReferenceNumber: crn,
  });
}

export async function getSectionPrerequisites(
  term: string,
  crn: string,
): Promise<string> {
  return ssbPost("/searchResults/getSectionPrerequisites", {
    term,
    courseReferenceNumber: crn,
  });
}

export async function getCorequisites(
  term: string,
  crn: string,
): Promise<string> {
  return ssbPost("/searchResults/getCorequisites", {
    term,
    courseReferenceNumber: crn,
  });
}

export async function getRestrictions(
  term: string,
  crn: string,
): Promise<string> {
  return ssbPost("/searchResults/getRestrictions", {
    term,
    courseReferenceNumber: crn,
  });
}

export async function getSectionAttributes(
  term: string,
  crn: string,
): Promise<string> {
  return ssbPost("/searchResults/getSectionAttributes", {
    term,
    courseReferenceNumber: crn,
  });
}

export async function resetDataForm(): Promise<void> {
  await ssbPost("/courseSearch/resetDataForm", {
    resetCourses: "true",
    resetSections: "true",
  });
}

// ── Plan Ahead ──────────────────────────────────────────────────────────────

async function ssbPostJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${SSB_BASE}${path}`, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      Accept: "application/json, text/javascript, */*; q=0.01",
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      "X-Synchronizer-Token": syncToken(),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`SSB POST JSON ${path} failed: ${res.status}`);
  return res.json();
}

export async function getPlanTerms(
  searchTerm = "",
  offset = 1,
  max = 10,
): Promise<SSBTerm[]> {
  return ssbGet("/plan/getTerms", {
    searchTerm,
    offset: String(offset),
    max: String(max),
  });
}

export async function savePlanTerm(term: string): Promise<void> {
  await ssbGet("/term/saveTerm", {
    mode: "plan",
    term,
    uniqueSessionId: sessionId(),
  });
}

export async function addPlanItem(
  term: string,
  crn: string,
): Promise<SSBAddPlanItemResponse> {
  return ssbPost("/plan/addPlanItem", {
    term,
    courseReferenceNumber: crn,
    section: "section",
  });
}

export async function getPlanEvents(termFilter = ""): Promise<unknown[]> {
  return ssbGet("/plan/getPlanEvents", { termFilter });
}

export async function submitPlanBatch(
  payload: SSBPlanBatchPayload,
): Promise<unknown> {
  return ssbPostJson("/plan/submitPlan/batch", payload);
}

// ── Registration History ────────────────────────────────────────────────────

export async function resetRegistrationHistory(
  term: string,
): Promise<SSBRegistrationHistoryResponse> {
  return ssbGet("/registrationHistory/reset", { term });
}

export async function getRegistrationEvents(
  termFilter = "",
): Promise<SSBRegistrationEvent[]> {
  return ssbGet("/classRegistration/getRegistrationEvents", { termFilter });
}

export async function getMeetingInformationForRegistrations(): Promise<
  SSBRegistrationSection[]
> {
  return ssbGet("/classRegistration/getMeetingInformationForRegistrations", {});
}

export async function printSchedule(): Promise<string> {
  return ssbGet("/classRegistration/print", {});
}

export async function emailSchedule(
  email: string,
  subject = "",
): Promise<string> {
  return ssbGet("/classRegistration/email", {
    listOfEmails: email,
    subject,
    scp: "false",
  });
}

// ── Class Registration (Register / Add-Drop) ────────────────────────────────

export async function getRegistrationTerms(
  searchTerm = "",
  offset = 1,
  max = 10,
): Promise<SSBTerm[]> {
  return ssbGet("/classRegistration/getTerms", {
    searchTerm,
    offset: String(offset),
    max: String(max),
  });
}

export async function saveRegistrationTerm(term: string): Promise<void> {
  await ssbGet("/term/saveTerm", {
    mode: "registration",
    term,
    uniqueSessionId: sessionId(),
  });
}

export async function searchRegistrationTerm(
  term: string,
  altPin = "",
): Promise<unknown> {
  return ssbPost("/term/search?mode=registration", {
    term,
    studyPath: "",
    studyPathText: "",
    altPin,
    startDatepicker: "",
    endDatepicker: "",
    uniqueSessionId: sessionId(),
  });
}

export async function resetClassRegistration(
  sortColumn = "courseTitle",
  sortDirection = "asc",
): Promise<unknown> {
  return ssbGet("/classRegistration/reset", {
    selectedTab: "true",
    sortColumn,
    sortDirection,
    uniqueSessionId: sessionId(),
  });
}

export async function getSectionDetailsFromCRN(
  crn: string,
  term: string,
): Promise<unknown> {
  return ssbGet("/classRegistration/getSectionDetailsFromCRN", {
    courseReferenceNumber: crn,
    term,
  });
}

export async function getPlans(): Promise<SSBGetPlansResponse> {
  return ssbGet("/classRegistration/getPlans", {});
}

export async function addCRNRegistrationItems(
  crnList: string[],
  term: string,
): Promise<SSBAddCRNRegistrationResponse> {
  return ssbPost("/classRegistration/addCRNRegistrationItems", {
    crnList: crnList.join(","),
    term,
  });
}

export async function addRegistrationItem(
  term: string,
  crn: string,
  olr = false,
): Promise<SSBAddRegistrationItemResponse> {
  return ssbGet("/classRegistration/addRegistrationItem", {
    term,
    courseReferenceNumber: crn,
    olr: String(olr),
  });
}

export async function submitRegistrationBatch(
  payload: SSBSubmitRegistrationBatchPayload,
): Promise<unknown> {
  return ssbPostJson("/classRegistration/submitRegistration/batch", payload);
}

export interface ExecuteRegistrationResult {
  stagingFailures: { crn: string; message: string }[];
  batchResponse: unknown;
}

/**
 * Stages the given CRNs via addCRNRegistrationItems, then POSTs to
 * submitRegistration/batch — the commit step that finalises registration.
 *
 * Returns both staging-level failures and the raw batch response so the
 * caller can build a complete per-CRN result.
 */
export async function executeRegistrationSubmit(
  term: string,
  crnList: string[],
): Promise<ExecuteRegistrationResult> {
  const normalized = crnList.map((c) => c.trim()).filter(Boolean);
  if (normalized.length === 0) {
    throw new Error("No CRNs to register");
  }

  // Step 1 — save + search term (mirrors entries [6]+[7] in HAR)
  await saveRegistrationTerm(term);
  await searchRegistrationTerm(term);

  // Step 2 — the browser navigates to classRegistration/classRegistration
  // which issues a NEW synchronizer token.  We fetch that page to pick it up.
  invalidateSyncToken();
  await refreshSyncTokenFromPage();

  const addRes = await addCRNRegistrationItems(normalized, term);
  const aaData = addRes.aaData ?? [];

  const stagingFailures = aaData
    .filter((row) => !row.success)
    .map((row) => ({
      crn: row.courseReferenceNumber,
      message: row.message || "Staging failed",
    }));

  const models = aaData
    .filter((row) => row.success && row.model != null)
    .map((row) => row.model);

  if (models.length === 0) {
    return {
      stagingFailures,
      batchResponse: null,
    };
  }

  const batchResponse = await submitRegistrationBatch({
    create: [],
    update: models,
    destroy: [],
    uniqueSessionId: sessionId(),
  });

  return { stagingFailures, batchResponse };
}

export async function getTuitionFeeDetail(): Promise<SSBTuitionFeeResponse> {
  return ssbGet("/classRegistration/renderTuitionFeeDetail", {});
}

// ── Instructor contact card ─────────────────────────────────────────────────

export async function getContactCard(
  bannerId: string,
  termCode: string,
): Promise<string> {
  return ssbGet("/contactCard/retrieveData", {
    bannerId,
    termCode,
  });
}

// ── Helpers for converting SSB data to our internal types ───────────────────

function meetingTimeToDays(mt: SSBMeetingFaculty["meetingTime"]): string {
  let days = "";
  if (mt.monday) days += "M";
  if (mt.tuesday) days += "T";
  if (mt.wednesday) days += "W";
  if (mt.thursday) days += "R";
  if (mt.friday) days += "F";
  if (mt.saturday) days += "S";
  if (mt.sunday) days += "U";
  return days;
}

function formatTime(raw: string): string {
  if (raw.length === 4) return `${raw.slice(0, 2)}:${raw.slice(2)}`;
  return raw;
}

/**
 * Convert an SSB section into our internal Section type used by
 * the schedule builder.  Creates one entry per meeting time block
 * so that lectures and labs are treated as separate slots for
 * conflict detection.
 */
export function ssbSectionToInternal(
  ssb: import("@/types/ssb").SSBSection,
): import("@/types").Section[] {
  const primaryInstructor =
    ssb.faculty.find((f) => f.primaryIndicator)?.displayName ??
    ssb.faculty[0]?.displayName ??
    "TBA";

  return ssb.meetingsFaculty.map((mf, idx) => ({
    crn: ssb.courseReferenceNumber,
    courseId: ssb.subjectCourse,
    instructor: primaryInstructor,
    days: meetingTimeToDays(mf.meetingTime),
    startTime: formatTime(mf.meetingTime.beginTime),
    endTime: formatTime(mf.meetingTime.endTime),
    location:
      `${mf.meetingTime.buildingDescription} ${mf.meetingTime.room}`.trim(),
    seatsAvailable: ssb.seatsAvailable,
    maxSeats: ssb.maximumEnrollment,
    term: ssb.termDesc,
  }));
}
