/**
 * Runs the student's DARS audit from the background script, as DARS's own
 * pages do (data/dars/audit workflow.har): the audit list, the "Run Audit"
 * form, the list until the run finishes, and its report. It uses the
 * student's existing DARS session, so no DARS tab is needed.
 */
import type { DarsAuditLookup } from "@workspace/shared/lib/dars";
import { isSignedOutAnswer, signedInFetch } from "@/lib/signed-in-fetch";
import { sleep } from "@/lib/sleep";
import { DARS_ORIGIN } from "@/lib/temple-urls";

const BASE = `${DARS_ORIGIN}/selfservice/audit`;
/**
 * Redirects to the "Run Audit" form at a `create.html?crossApp=…` address,
 * which the form posts back to.
 */
const FORM_ENTRY_URL = `${DARS_ORIGIN}/selfservice/student/setSelfAsCurrentStudent.html`;
/** The delete checkbox on each audit list row holds its run id, newest first. */
const RUN_ID_RE = /name="delete_id"\s+value="(JobQueueRun!!!![^"]+)"/g;
const STILL_RUNNING = 'title="Still running"';

/** How often the audit list refreshes itself while a run is going. */
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 90_000;

/** DARS redirected to Temple's sign-in, which the extension doesn't follow. */
class DarsSignedOutError extends Error {}

async function darsPage(path: string, init?: RequestInit): Promise<string> {
  const res = await signedInFetch(`${BASE}/${path}`, init);
  if (isSignedOutAnswer(res)) throw new DarsSignedOutError();
  if (!res.ok) throw new Error(`DARS returned HTTP ${res.status}`);
  return res.text();
}

function runIds(listHtml: string): string[] {
  return [...listHtml.matchAll(RUN_ID_RE)].map((match) => match[1]!);
}

/** Where DARS's "Run Audit" form is, which the form posts back to. */
async function openAuditForm(): Promise<string> {
  // The redirect stays on DARS, so it's followed to learn the form's address.
  const res = await signedInFetch(FORM_ENTRY_URL, { redirect: "follow" });
  if (!res.ok || !res.url.startsWith(`${BASE}/create.html`)) {
    throw new Error("Could not open the audit form in DARS.");
  }
  return res.url;
}

/** The school and catalog year the form fills in, from the request the form's page makes. */
async function formDefaults(): Promise<{
  instcd: string;
  catalogYearTerm: string;
}> {
  const form = JSON.parse(
    await darsPage(`initializeWhatIfAudit.html?_=${Date.now()}`, {
      headers: {
        Accept: "application/json, text/javascript, */*; q=0.01",
        "X-Requested-With": "XMLHttpRequest",
      },
    }),
  );
  const instcd: string | undefined = form?.institutionsData?.instcd;
  const catalogYearTerm: string | undefined =
    form?.catalogYearTermValues?.catalogYearTerm;
  if (!instcd || !catalogYearTerm) {
    throw new Error("Could not read the audit form from DARS.");
  }
  return { instcd, catalogYearTerm };
}

/** Asks DARS for a new declared-program audit, as its "Run Audit" form does. */
async function requestAudit(): Promise<void> {
  const formUrl = await openAuditForm();
  const { instcd, catalogYearTerm } = await formDefaults();
  const res = await signedInFetch(formUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    // Every field DARS's form sends, in its order, empty ones included.
    body: new URLSearchParams([
      ["instcd", instcd],
      ["previousDegreeProgramCollege", "null"],
      ["degreeProgramCollege", ""],
      ["previousDegreeProgramMajor", "null"],
      ["degreeProgramMajor", ""],
      ["previousDegreeProgramDegree", "null"],
      ["degreeProgramDegree", ""],
      ["previousWhatIfDegreeProgram", ""],
      ["whatIfDegreeProgram", ""],
      ["catalogYearTerm", catalogYearTerm],
      ["requiredMarker", ""],
      // The checkbox, then the empty field the form sends alongside it.
      ["includeInProgressCourses", "true"],
      ["includeInProgressCourses", ""],
      ["includePlannedCourses", " "],
      ["sysIn.evalsw", "S"],
      ["auditTemplate", "htm!!!!htm"],
      ["useDefaultDegreePrograms", "true"],
      ["pageRefresh", "false"],
    ]),
  });
  // DARS answers a run it accepted with a redirect to the audit list.
  if (res.type !== "opaqueredirect") {
    throw new Error("DARS didn't start the audit.");
  }
}

/** The run DARS added after `existing`, once it has finished. */
async function newRun(existing: readonly string[]): Promise<string> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  for (;;) {
    const page = await darsPage("list.html?autoPoll=true");
    if (!page.includes(STILL_RUNNING)) {
      const run = runIds(page).find((id) => !existing.includes(id));
      if (run) return run;
    }
    if (Date.now() >= deadline) {
      throw new Error("DARS did not finish the audit in time.");
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

/** Runs a new audit and returns its printer-friendly report. */
export async function runAudit(): Promise<DarsAuditLookup> {
  try {
    // The list also tells a signed-in session from a signed-out one.
    const existing = runIds(await darsPage("list.html"));
    await requestAudit();
    // As DARS links it, the run id unencoded.
    const report = `read.html?printerFriendly=true&id=${await newRun(existing)}`;
    return { status: "found", html: await darsPage(report) };
  } catch (err) {
    if (err instanceof DarsSignedOutError) return { status: "signed-out" };
    throw err;
  }
}
