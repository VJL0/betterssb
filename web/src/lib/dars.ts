/** Types mirror backend/app/domains/dars/schemas.py (camelCase over the wire). */

export type AuditStatus = "complete" | "incomplete" | "in_progress" | "none";

export interface Progress {
  credits: number | null;
  courses: number | null;
  gpa: number | null;
}

export interface AuditCourse {
  term: string;
  course: string;
  title: string;
  credits: number | null;
  grade: string;
  inProgress: boolean;
}

export interface SubRequirement {
  number: string;
  title: string;
  status: AuditStatus;
  earned: Progress | null;
  inProgress: Progress | null;
  needs: Progress | null;
  courses: AuditCourse[];
  selectFrom: string[];
}

export interface Requirement {
  code: string;
  category: string;
  title: string;
  status: AuditStatus;
  notes: string[];
  earned: Progress | null;
  inProgress: Progress | null;
  needs: Progress | null;
  subrequirements: SubRequirement[];
}

export interface Audit {
  studentName: string;
  programTitle: string;
  programCode: string;
  catalogYear: string;
  preparedOn: string;
  complete: boolean | null;
  requirements: Requirement[];
}

export class AuditError extends Error {}

async function detail(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => null)) as {
    detail?: unknown;
  } | null;
  return typeof body?.detail === "string" ? body.detail : fallback;
}

/** Parses an already-fetched DARS audit page (from the extension or an uploaded file). */
export async function parseAuditHtml(
  html: string,
  signal?: AbortSignal,
): Promise<Audit> {
  const res = await fetch("/api/v1/dars/audits/parse", {
    method: "POST",
    headers: { "Content-Type": "text/html" },
    body: html,
    signal,
  });
  if (res.ok) return (await res.json()) as Audit;
  throw new AuditError(
    await detail(
      res,
      res.status === 422
        ? "That file doesn't look like a DARS audit page."
        : `Couldn't read the audit (HTTP ${res.status}).`,
    ),
  );
}

/** Reads a saved printer-friendly DARS audit file and parses it. */
export async function runFromFile(file: File): Promise<Audit> {
  return parseAuditHtml(await file.text());
}

/** A requirement that is only explanatory text (DARS banners like WARNING, MAJOR, SUMMARY). */
export function isNoteOnly(req: Requirement): boolean {
  return !req.title && req.subrequirements.length === 0;
}

export function formatCredits(n: number | null | undefined): string {
  if (n == null) return "";
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
