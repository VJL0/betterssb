/**
 * Runs a degree audit in u.achieve self-service (DARS) from the content script.
 *
 * Every request is same-origin on the DARS host, so the browser attaches the
 * student's existing DARS session cookie automatically — the extension never
 * reads, stores, or forwards any credential. The flow mirrors what the DARS
 * web UI does: request an audit, poll until it finishes, then read the report.
 */

const BASE = "/selfservice/audit";
const RUN_ID_RE = /name="delete_id"\s+value="(JobQueueRun!!!![^"]+)"/g;
const STILL_RUNNING = 'title="Still running"';

const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 90_000;

export class DarsSessionExpiredError extends Error {
  constructor() {
    super("Your DARS session has expired. Open DARS, sign in, and try again.");
    this.name = "DarsSessionExpiredError";
  }
}

async function darsFetch(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(path, { credentials: "same-origin", ...init });
  // An expired session makes DARS redirect to the Temple SSO host (fim.temple.edu).
  if (/\/(saml|idp)\//.test(res.url) || res.url.includes("fim.")) {
    throw new DarsSessionExpiredError();
  }
  if (!res.ok) throw new Error(`DARS returned HTTP ${res.status}`);
  return res;
}

function runIds(listHtml: string): string[] {
  return [...listHtml.matchAll(RUN_ID_RE)].map((m) => m[1]);
}

/**
 * Requests a fresh declared-program audit, waits for DARS to finish it, and
 * returns the printer-friendly report HTML (the same page as `read.html`).
 */
export async function runAudit(): Promise<string> {
  const existing = runIds(await (await darsFetch(`${BASE}/list.html`)).text());

  await darsFetch(`${BASE}/create.html`);
  const init = await (
    await darsFetch(`${BASE}/initializeWhatIfAudit.html?_=${Date.now()}`, {
      headers: { "X-Requested-With": "XMLHttpRequest" },
    })
  ).json();

  const instcd = init?.institutionsData?.instcd;
  const catalogYearTerm = init?.catalogYearTermValues?.catalogYearTerm;
  if (!instcd || !catalogYearTerm) {
    throw new Error("Could not read the audit form from DARS.");
  }

  const form = new URLSearchParams({
    instcd,
    previousDegreeProgramCollege: "null",
    previousDegreeProgramMajor: "null",
    previousDegreeProgramDegree: "null",
    catalogYearTerm,
    includeInProgressCourses: "true",
    includePlannedCourses: " ",
    "sysIn.evalsw": "S",
    auditTemplate: "htm!!!!htm",
    useDefaultDegreePrograms: "true",
    pageRefresh: "false",
  });
  await darsFetch(`${BASE}/create.html`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });

  const runId = await waitForRun(existing);
  const params = new URLSearchParams({ printerFriendly: "true", id: runId });
  return (await darsFetch(`${BASE}/read.html?${params}`)).text();
}

async function waitForRun(existing: string[]): Promise<string> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  for (;;) {
    const page = await (
      await darsFetch(`${BASE}/list.html?autoPoll=true`)
    ).text();
    if (!page.includes(STILL_RUNNING)) {
      const fresh = runIds(page).find((id) => !existing.includes(id));
      if (fresh) return fresh;
    }
    if (Date.now() >= deadline) {
      throw new Error("DARS did not finish the audit in time.");
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}
