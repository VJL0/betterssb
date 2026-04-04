// ── Types matching the real Banner submitRegistration/batch response ─────────

export interface BatchMessage {
  message: string;
  type: "success" | "error" | string;
  field: string | null;
}

export interface BatchCrnError {
  errorFlag: string;
  message: string;
  messageType: string;
}

export interface BatchUpdateItem {
  courseReferenceNumber: string;
  subject: string;
  courseNumber: string;
  courseTitle: string;
  sectionCourseTitle?: string;
  statusIndicator: string;
  statusDescription: string;
  messages: BatchMessage[];
  crnErrors: BatchCrnError[];
  errorFlag: string | null;
  message: string | null;
  messageType: string | null;
}

export interface BatchResponseData {
  create: unknown[];
  destroy: unknown[];
  update: BatchUpdateItem[];
}

export interface BatchResponse {
  success: boolean;
  data: BatchResponseData;
  registeredHours: string;
  billingHours: string;
  maxHours: string;
  minHours: string;
  message: string | null;
}

// ── Staging (addCRNRegistrationItems) failure record ────────────────────────

export interface StagingFailure {
  crn: string;
  message: string;
}

// ── Per-CRN result line for the UI ──────────────────────────────────────────

export interface CrnResultLine {
  crn: string;
  label: string;
  ok: boolean;
  detail: string;
}

// ── Full result record persisted to storage ─────────────────────────────────

export interface AutoRegBatchResultRecord {
  at: string;
  ok: boolean;
  registeredCount: number;
  failedCount: number;
  stagingFailures: StagingFailure[];
  crnResults: CrnResultLine[];
  registeredHours: string | null;
  billingHours: string | null;
  summary: string;
  error?: string;
}

// ── Builder ─────────────────────────────────────────────────────────────────

function htmlDecode(s: string): string {
  return s
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
}

export function buildResultRecord(
  batchResponse: unknown,
  stagingFailures: StagingFailure[],
  at: string,
): AutoRegBatchResultRecord {
  const crnResults: CrnResultLine[] = [];
  let registeredCount = 0;
  let failedCount = 0;
  let registeredHours: string | null = null;
  let billingHours: string | null = null;

  for (const sf of stagingFailures) {
    failedCount++;
    crnResults.push({
      crn: sf.crn,
      label: `CRN ${sf.crn}`,
      ok: false,
      detail: `Staging failed: ${sf.message}`,
    });
  }

  const resp = batchResponse as Partial<BatchResponse> | null;
  const updateItems = resp?.data?.update ?? [];

  for (const item of updateItems) {
    const crn = item.courseReferenceNumber ?? "";
    const label = [item.subject, item.courseNumber].filter(Boolean).join(" ");
    const title = item.sectionCourseTitle ?? item.courseTitle ?? "";
    const isRegistered = item.statusIndicator === "R";

    if (isRegistered) {
      registeredCount++;
      const msg =
        item.messages?.find((m) => m.type === "success")?.message ??
        "Registered";
      crnResults.push({
        crn,
        label: label ? `${label} — ${title}` : `CRN ${crn}`,
        ok: true,
        detail: htmlDecode(msg),
      });
    } else {
      failedCount++;
      const errMsg =
        item.messages?.find((m) => m.type === "error")?.message ??
        item.crnErrors?.[0]?.message ??
        item.message ??
        item.statusDescription ??
        "Registration error";
      crnResults.push({
        crn,
        label: label ? `${label} — ${title}` : `CRN ${crn}`,
        ok: false,
        detail: htmlDecode(errMsg),
      });
    }
  }

  registeredHours = resp?.registeredHours ?? null;
  billingHours = resp?.billingHours ?? null;

  const allOk = failedCount === 0 && registeredCount > 0;
  const summary = allOk
    ? `All ${registeredCount} section${registeredCount === 1 ? "" : "s"} registered (${registeredHours ?? "?"} hrs)`
    : `${registeredCount} registered, ${failedCount} failed`;

  return {
    at,
    ok: allOk,
    registeredCount,
    failedCount,
    stagingFailures,
    crnResults,
    registeredHours,
    billingHours,
    summary,
  };
}
