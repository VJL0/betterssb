import { afterEach, describe, expect, it, vi } from "vitest";
import { stoppedRedirect } from "@/test/responses";
import { runAudit } from "./dars-api";

const BASE = "https://prd-dars.temple.edu/selfservice";
/** Where `setSelfAsCurrentStudent.html` redirects: the "Run Audit" form, which posts back here. */
const FORM_URL = `${BASE}/audit/create.html?crossApp=CrossAppUrlAttributes!!!!c3R1ZGVudD14`;
const OLD_RUN = "JobQueueRun!!!!ISEhIWludFNlcU5vPTk0NDA5MzM=";
const NEW_RUN = "JobQueueRun!!!!ISEhIWludFNlcU5vPTk0NDY2NTA=";
const REPORT = "<html>audit report</html>";

/** The audit list as DARS shows it (data/dars/audit workflow.har): one row per run, newest first. */
function auditList(runs: string[], stillRunning = false): string {
  const rows = runs.map(
    (run) =>
      `<tr><td><input type="checkbox" name="delete_id" value="${run}" /></td></tr>`,
  );
  const running = stillRunning
    ? '<tr><td><img title="Still running" /></td></tr>'
    : "";
  return `<table>${running}${rows.join("")}</table>`;
}

/**
 * Answers each DARS page in turn: `lists` are the audit list's answers, in
 * order, and the run form and report answer as DARS's do.
 */
function stubDars({
  lists,
  formAt = FORM_URL,
  created = stoppedRedirect,
}: {
  lists: (() => Response)[];
  /** Where the form entry's redirect lands. */
  formAt?: string;
  created?: () => Response;
}) {
  const answers = [...lists];
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const path = url.slice(BASE.length + 1);
    if (path.startsWith("audit/list.html")) return answers.shift()!();
    if (path === "student/setSelfAsCurrentStudent.html") {
      const form = new Response("<form />");
      Object.defineProperty(form, "url", { value: formAt });
      return form;
    }
    if (path.startsWith("audit/initializeWhatIfAudit.html")) {
      return Response.json({
        institutionsData: { instcd: "TUB" },
        catalogYearTermValues: { catalogYearTerm: "202636" },
      });
    }
    if (url === FORM_URL && init?.method === "POST") return created();
    if (path.startsWith("audit/read.html")) return new Response(REPORT);
    throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${url}`);
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

function requestedPaths(fetch: ReturnType<typeof stubDars>): string[] {
  return fetch.mock.calls.map(
    ([url, init]) =>
      `${init?.method ?? "GET"} ${url.slice(BASE.length + 1).split("?")[0]}`,
  );
}

function html(body: string) {
  return () => new Response(body);
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("runAudit", () => {
  it("runs a new audit and opens it once DARS finishes", async () => {
    vi.useFakeTimers();
    const fetch = stubDars({
      lists: [
        html(auditList([OLD_RUN])),
        html(auditList([OLD_RUN], true)),
        html(auditList([NEW_RUN, OLD_RUN])),
      ],
    });
    const audit = runAudit();
    await vi.runAllTimersAsync();
    await expect(audit).resolves.toEqual({ status: "found", html: REPORT });
    // The same requests, in the same order, as data/dars/audit workflow.har.
    expect(requestedPaths(fetch)).toEqual([
      "GET audit/list.html",
      "GET student/setSelfAsCurrentStudent.html",
      "GET audit/initializeWhatIfAudit.html",
      "POST audit/create.html",
      "GET audit/list.html",
      "GET audit/list.html",
      "GET audit/read.html",
    ]);
    expect(fetch.mock.calls[3]![0]).toBe(FORM_URL);
    // Byte for byte the body DARS's own form posted in the HAR.
    expect(String(fetch.mock.calls[3]![1]!.body)).toBe(
      "instcd=TUB&previousDegreeProgramCollege=null&degreeProgramCollege=&previousDegreeProgramMajor=null&degreeProgramMajor=&previousDegreeProgramDegree=null&degreeProgramDegree=&previousWhatIfDegreeProgram=&whatIfDegreeProgram=&catalogYearTerm=202636&requiredMarker=&includeInProgressCourses=true&includeInProgressCourses=&includePlannedCourses=+&sysIn.evalsw=S&auditTemplate=htm%21%21%21%21htm&useDefaultDegreePrograms=true&pageRefresh=false",
    );
    expect(fetch).toHaveBeenLastCalledWith(
      `${BASE}/audit/read.html?printerFriendly=true&id=${NEW_RUN}`,
      { credentials: "include", redirect: "manual", cache: "no-store" },
    );
  });

  it("is signed out when DARS redirects to Temple's sign-in", async () => {
    stubDars({ lists: [stoppedRedirect] });
    await expect(runAudit()).resolves.toEqual({ status: "signed-out" });
  });

  it("fails when DARS doesn't open the audit form", async () => {
    stubDars({
      lists: [html(auditList([OLD_RUN]))],
      formAt: `${BASE}/general/loginroute.html`,
    });
    await expect(runAudit()).rejects.toThrow(
      "Could not open the audit form in DARS.",
    );
  });

  it("fails when DARS doesn't accept the run", async () => {
    stubDars({
      lists: [html(auditList([OLD_RUN]))],
      created: () => new Response("<form>errors</form>"),
    });
    await expect(runAudit()).rejects.toThrow("DARS didn't start the audit.");
  });
});
