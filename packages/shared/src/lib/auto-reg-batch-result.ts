import { isRecord } from "./guards";

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

// ── Staging (addCRNRegistrationItems) failure record ────────────────────────

export interface StagingFailure {
  crn: string;
  message: string;
}

/** What the content script answers SSB_AUTO_REGISTER_RUN with. */
export interface ExecuteRegistrationResult {
  stagingFailures: StagingFailure[];
  batchResponse: unknown;
}

// ── Type guards for data from Banner, the content script and storage ────────

function isStagingFailure(value: unknown): value is StagingFailure {
  return (
    isRecord(value) &&
    typeof value.crn === "string" &&
    typeof value.message === "string"
  );
}

export function isExecuteRegistrationResult(
  value: unknown,
): value is ExecuteRegistrationResult {
  return (
    isRecord(value) &&
    "batchResponse" in value &&
    Array.isArray(value.stagingFailures) &&
    value.stagingFailures.every(isStagingFailure)
  );
}

function isBatchUpdateItem(value: unknown): value is BatchUpdateItem {
  return (
    isRecord(value) &&
    typeof value.courseReferenceNumber === "string" &&
    typeof value.statusIndicator === "string"
  );
}

function batchUpdateRows(batchResponse: unknown): BatchUpdateItem[] {
  if (!isRecord(batchResponse) || !isRecord(batchResponse.data)) return [];
  const { update } = batchResponse.data;
  return Array.isArray(update) ? update.filter(isBatchUpdateItem) : [];
}

function batchHours(
  batchResponse: unknown,
  field: "registeredHours" | "billingHours",
): string | null {
  if (!isRecord(batchResponse)) return null;
  const hours = batchResponse[field];
  return typeof hours === "string" ? hours : null;
}

// ── Per-CRN result line for the UI ──────────────────────────────────────────

export type CrnOutcome = "registered" | "waitlisted" | "failed";

/** The badge each outcome shows; tones match `StatusTone` in @workspace/ui. */
export const CRN_OUTCOME_BADGE = {
  registered: { label: "Registered", tone: "success" },
  waitlisted: { label: "Waitlisted", tone: "warning" },
  failed: { label: "Not registered", tone: "destructive" },
} as const satisfies Record<CrnOutcome, { label: string; tone: string }>;

export interface CrnResultLine {
  crn: string;
  label: string;
  outcome: CrnOutcome;
  detail: string;
}

// ── Full result record persisted to storage ─────────────────────────────────

export interface AutoRegBatchResultRecord {
  at: string;
  ok: boolean;
  registeredCount: number;
  waitlistedCount: number;
  failedCount: number;
  stagingFailures: StagingFailure[];
  crnResults: CrnResultLine[];
  registeredHours: string | null;
  billingHours: string | null;
  summary: string;
  error?: string;
}

// ── Builder ─────────────────────────────────────────────────────────────────

/** Banner's `statusIndicator` for rows that got a seat or a waitlist spot. */
const OUTCOME_BY_STATUS_INDICATOR: Record<string, CrnOutcome> = {
  R: "registered",
  L: "waitlisted",
};

function htmlDecode(s: string): string {
  return s
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
}

function rowOutcome(item: BatchUpdateItem): CrnOutcome {
  return OUTCOME_BY_STATUS_INDICATOR[item.statusIndicator] ?? "failed";
}

// Banner marks every row's message "success", waitlisted ones included, so
// only a failed row's message says anything.
function rowDetail(item: BatchUpdateItem, outcome: CrnOutcome): string {
  if (outcome === "registered") return "Registered";
  if (outcome === "waitlisted") return "Added to the waitlist";
  return htmlDecode(
    item.messages?.find((m) => m.type === "error")?.message ??
      item.crnErrors?.[0]?.message ??
      item.message ??
      item.statusDescription ??
      "Registration error",
  );
}

function rowLine(item: BatchUpdateItem): CrnResultLine {
  const crn = item.courseReferenceNumber;
  const label = [item.subject, item.courseNumber].filter(Boolean).join(" ");
  const title = item.sectionCourseTitle ?? item.courseTitle ?? "";
  const outcome = rowOutcome(item);
  return {
    crn,
    label: label ? `${label} — ${title}` : `CRN ${crn}`,
    outcome,
    detail: rowDetail(item, outcome),
  };
}

function missingRowLine(crn: string): CrnResultLine {
  return {
    crn,
    label: `CRN ${crn}`,
    outcome: "failed",
    detail: "Banner didn't return a result for this CRN",
  };
}

function stagingFailureLine({ crn, message }: StagingFailure): CrnResultLine {
  return {
    crn,
    label: `CRN ${crn}`,
    outcome: "failed",
    detail: `Staging failed: ${message}`,
  };
}

function countOutcome(lines: CrnResultLine[], outcome: CrnOutcome): number {
  return lines.filter((line) => line.outcome === outcome).length;
}

function summarize(
  registered: number,
  waitlisted: number,
  failed: number,
  registeredHours: string | null,
): string {
  if (failed === 0 && waitlisted === 0 && registered > 0) {
    return `All ${registered} section${registered === 1 ? "" : "s"} registered (${registeredHours ?? "?"} hrs)`;
  }
  const parts = [`${registered} registered`];
  if (waitlisted > 0) parts.push(`${waitlisted} waitlisted`);
  if (failed > 0 || waitlisted === 0) parts.push(`${failed} failed`);
  return parts.join(", ");
}

/**
 * Turns a submitRegistration/batch response into one line per submitted CRN.
 * Banner's response lists the student's whole schedule, so rows for CRNs
 * this run didn't submit are left out.
 */
export function buildResultRecord(
  batchResponse: unknown,
  submittedCrns: string[],
  stagingFailures: StagingFailure[],
  at: string,
): AutoRegBatchResultRecord {
  const rowsByCrn = new Map(
    batchUpdateRows(batchResponse).map((item) => [
      item.courseReferenceNumber,
      item,
    ]),
  );
  const stagingFailed = new Set(stagingFailures.map((sf) => sf.crn));

  const crnResults = [
    ...stagingFailures.map(stagingFailureLine),
    ...submittedCrns
      .filter((crn) => !stagingFailed.has(crn))
      .map((crn) => {
        const row = rowsByCrn.get(crn);
        return row ? rowLine(row) : missingRowLine(crn);
      }),
  ];

  const registeredCount = countOutcome(crnResults, "registered");
  const waitlistedCount = countOutcome(crnResults, "waitlisted");
  const failedCount = countOutcome(crnResults, "failed");
  const registeredHours = batchHours(batchResponse, "registeredHours");

  return {
    at,
    ok: failedCount === 0 && registeredCount + waitlistedCount > 0,
    registeredCount,
    waitlistedCount,
    failedCount,
    stagingFailures,
    crnResults,
    registeredHours,
    billingHours: batchHours(batchResponse, "billingHours"),
    summary: summarize(
      registeredCount,
      waitlistedCount,
      failedCount,
      registeredHours,
    ),
  };
}

/** The record for a run that failed before Banner answered, e.g. with no Banner tab open. */
export function failedResultRecord(
  error: string,
  at: string,
): AutoRegBatchResultRecord {
  return {
    at,
    ok: false,
    registeredCount: 0,
    waitlistedCount: 0,
    failedCount: 0,
    stagingFailures: [],
    crnResults: [],
    registeredHours: null,
    billingHours: null,
    summary: error,
    error,
  };
}

/** "2 of 3 registered, 1 waitlisted", or null when no CRN was tried. */
export function outcomeHeadline(
  record: AutoRegBatchResultRecord,
): string | null {
  const { registeredCount, waitlistedCount, failedCount } = record;
  const total = registeredCount + waitlistedCount + failedCount;
  if (total === 0) return null;
  const headline = `${registeredCount} of ${total} registered`;
  return waitlistedCount > 0
    ? `${headline}, ${waitlistedCount} waitlisted`
    : headline;
}

function isCrnOutcome(value: unknown): value is CrnOutcome {
  return typeof value === "string" && Object.hasOwn(CRN_OUTCOME_BADGE, value);
}

function isCrnResultLine(value: unknown): value is CrnResultLine {
  return (
    isRecord(value) &&
    typeof value.crn === "string" &&
    typeof value.label === "string" &&
    isCrnOutcome(value.outcome) &&
    typeof value.detail === "string"
  );
}

/** Whether a stored or relayed value is a run's result record. */
export function isResultRecord(
  value: unknown,
): value is AutoRegBatchResultRecord {
  return (
    isRecord(value) &&
    typeof value.at === "string" &&
    typeof value.ok === "boolean" &&
    typeof value.summary === "string" &&
    Array.isArray(value.crnResults) &&
    value.crnResults.every(isCrnResultLine)
  );
}
