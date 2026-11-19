/**
 * Client for the Ellucian Self-Service Banner (SSB) registration API, called
 * from the background script: auto-register, CRN checks and the web bridge.
 *
 * The extension's host permission lets these requests carry the student's
 * existing Banner cookies, so no Banner tab needs to be open and the
 * extension never reads, stores or forwards a credential. Banner requires an
 * `X-Synchronizer-Token` CSRF header on every XHR, which Banner prints into
 * each page it renders; the client reads it from one.
 */

import type {
  SSBTerm,
  SSBGetPlansResponse,
  SSBAddCRNRegistrationResponse,
  SSBSubmitRegistrationBatchPayload,
} from "@workspace/shared/types/ssb";
import type { ExecuteRegistrationResult } from "@workspace/shared/lib/auto-reg-batch-result";
import { BANNER_ORIGIN } from "@/lib/temple-urls";
import { loggedFetch } from "@/lib/logged-fetch";

const SSB_BASE = `${BANNER_ORIGIN}/StudentRegistrationSsb/ssb`;
/**
 * The page Banner shows right after sign-in, read for its token. Not the
 * `/registration` landing page: loading that ends the signed-in session
 * (docs/ssb-login-system.md, "Observed anomalies").
 */
const TOKEN_PAGE = "/term/termSelection?mode=registration";
/** After `term/search`, Banner issues a new token on this page. */
const CLASS_REGISTRATION_PAGE = "/classRegistration/classRegistration";
const SYNC_TOKEN =
  /name\s*=\s*"synchronizerToken"\s+content\s*=\s*"([0-9a-f-]{36})"/;
const SIGNED_OUT_STATUSES: ReadonlySet<number> = new Set([401, 403]);

/**
 * Banner wouldn't open registration for the term (no registration time yet, holds),
 * so its registration endpoints can't be called: called anyway, Banner ends
 * the student's session.
 */
export class RegistrationClosedError extends Error {
  constructor(reasons: readonly string[]) {
    super(
      reasons.length > 0
        ? reasons.join(" ")
        : "Banner registration isn't open for this term.",
    );
    this.name = "RegistrationClosedError";
  }
}

/** Banner answered as it does for a session with no signed-in student. */
export class BannerSignedOutError extends Error {
  constructor() {
    super("Banner signed you out. Sign in to Banner, then try again.");
    this.name = "BannerSignedOutError";
  }
}

let _syncToken: string | null = null;
let _uniqueSessionId: string | null = null;

/**
 * Sends a request with the student's Banner cookies. Redirects aren't
 * followed: Banner only redirects a signed-out session, to Temple's sign-in.
 */
async function bannerFetch(path: string, init: RequestInit = {}) {
  const res = await loggedFetch(`${SSB_BASE}${path}`, {
    ...init,
    credentials: "include",
    redirect: "manual",
    cache: "no-store",
  });
  if (res.type === "opaqueredirect" || SIGNED_OUT_STATUSES.has(res.status)) {
    throw new BannerSignedOutError();
  }
  return res;
}

/** Renders a Banner page and keeps the synchronizer token it carries. */
async function loadSyncToken(page: string): Promise<string> {
  const res = await bannerFetch(page);
  if (!res.ok) throw new Error(`Banner returned HTTP ${res.status}`);
  const token = SYNC_TOKEN.exec(await res.text())?.[1];
  if (!token) throw new Error("Couldn't read Banner's security token.");
  _syncToken = token;
  return token;
}

async function syncToken(): Promise<string> {
  return _syncToken ?? loadSyncToken(TOKEN_PAGE);
}

/**
 * A kept token goes stale when Banner starts a new session, and Banner
 * answers a stale token the way it answers a signed-out one. One retry with a
 * fresh token tells them apart.
 */
async function withFreshToken<T>(call: () => Promise<T>): Promise<T> {
  const hadToken = _syncToken !== null;
  try {
    return await call();
  } catch (err) {
    if (!hadToken || !(err instanceof BannerSignedOutError)) throw err;
    _syncToken = null;
    return call();
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

async function xhrHeaders(accept: string): Promise<Record<string, string>> {
  return {
    Accept: accept,
    "X-Requested-With": "XMLHttpRequest",
    "X-Synchronizer-Token": await syncToken(),
  };
}

async function ssbGet<T>(
  path: string,
  params: Record<string, string> = {},
): Promise<T> {
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") query.set(k, v);
  }
  query.set("_", cacheBuster());

  return withFreshToken(async () => {
    const res = await bannerFetch(`${path}?${query}`, {
      headers: await xhrHeaders(
        "application/json, text/javascript, */*; q=0.01",
      ),
    });
    if (!res.ok) throw new Error(`SSB GET ${path} failed: ${res.status}`);
    return res.json();
  });
}

async function ssbPost<T>(
  path: string,
  body: Record<string, string>,
): Promise<T> {
  return withFreshToken(async () => {
    const res = await bannerFetch(path, {
      method: "POST",
      headers: {
        ...(await xhrHeaders("text/html, */*; q=0.01")),
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      },
      body: new URLSearchParams(body).toString(),
    });
    if (!res.ok) throw new Error(`SSB POST ${path} failed: ${res.status}`);
    // Banner labels some JSON answers text/html, so it's parsed from the text.
    return JSON.parse(await res.text());
  });
}

async function ssbPostJson<T>(path: string, body: unknown): Promise<T> {
  return withFreshToken(async () => {
    const res = await bannerFetch(path, {
      method: "POST",
      headers: {
        ...(await xhrHeaders("application/json, text/javascript, */*; q=0.01")),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`SSB POST JSON ${path} failed: ${res.status}`);
    return res.json();
  });
}

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

async function saveRegistrationTerm(term: string): Promise<void> {
  await ssbGet("/term/saveTerm", {
    mode: "registration",
    term,
    uniqueSessionId: sessionId(),
  });
}

/**
 * What `term/search` answers. `fwdURL` comes even when registration is
 * closed ("Time tickets prevent registration at this time."), so only the
 * two flags say whether it opened.
 */
interface TermSearchAnswer {
  fwdURL?: string;
  regAllowed?: boolean;
  studentEligValid?: boolean;
  studentEligFailures?: string[];
}

function isTermSearchAnswer(value: unknown): value is TermSearchAnswer {
  return typeof value === "object" && value !== null;
}

/** Banner's own term page goes on only when neither flag is false. */
function registrationOpened(answer: TermSearchAnswer): boolean {
  return (
    !!answer.fwdURL &&
    answer.regAllowed !== false &&
    answer.studentEligValid !== false
  );
}

async function searchRegistrationTerm(
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

/**
 * Opens registration for `term` in the student's Banner session, as picking a
 * term on Banner's term page does. Banner's `classRegistration` endpoints
 * answer only after this; before it they redirect to sign-in and end the
 * session (docs/ssb-login-system.md, "How the extension uses this").
 */
export async function openRegistration(term: string): Promise<void> {
  await saveRegistrationTerm(term);
  const answer = await searchRegistrationTerm(term);
  if (!isTermSearchAnswer(answer) || !registrationOpened(answer)) {
    const reasons = isTermSearchAnswer(answer)
      ? (answer.studentEligFailures ?? [])
      : [];
    throw new RegistrationClosedError(reasons);
  }
  // Banner issues a new token on the page `term/search` forwards to.
  await loadSyncToken(CLASS_REGISTRATION_PAGE);
}

/** Needs `openRegistration(term)` first. */
export async function getSectionDetailsFromCRN(
  crn: string,
  term: string,
): Promise<unknown> {
  return ssbGet("/classRegistration/getSectionDetailsFromCRN", {
    courseReferenceNumber: crn,
    term,
  });
}

/** The student's Banner plans for the term opened by `openRegistration`. */
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

async function submitRegistrationBatch(
  payload: SSBSubmitRegistrationBatchPayload,
): Promise<unknown> {
  return ssbPostJson("/classRegistration/submitRegistration/batch", payload);
}

/**
 * Stages the CRNs (addCRNRegistrationItems), then commits them
 * (submitRegistration/batch). Staging failures come back with the batch
 * response, so every CRN gets a result.
 */
export async function executeRegistrationSubmit(
  term: string,
  crnList: string[],
): Promise<ExecuteRegistrationResult> {
  const normalized = crnList.map((c) => c.trim()).filter(Boolean);
  if (normalized.length === 0) {
    throw new Error("No CRNs to register");
  }

  // A fresh token: one kept from an earlier session is no good.
  await loadSyncToken(TOKEN_PAGE);
  await openRegistration(term);

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
