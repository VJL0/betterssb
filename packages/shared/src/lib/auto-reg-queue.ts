/**
 * Rules for the auto-register queue that both the extension (which enforces
 * them before arming) and the website (which explains them) apply.
 */
import type { AutoRegQueue } from "../types/auto-reg";

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 60 * SECONDS_PER_MINUTE;
const SECONDS_PER_DAY = 24 * SECONDS_PER_HOUR;

/** Why the queue can't be armed yet, or null when it can. */
export function armProblem(queue: AutoRegQueue, now: number): string | null {
  if (!queue.term) return "Choose a term.";
  if (queue.crns.length === 0) return "Add at least one CRN.";
  if (!queue.scheduledRunAt) return "Set when to submit.";
  const at = new Date(queue.scheduledRunAt).getTime();
  if (!Number.isFinite(at)) return "Set when to submit.";
  if (at <= now) return "The submit time has passed. Pick a time ahead.";
  return null;
}

/** What a relayed Banner call returned. */
export interface RelayedResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * Whether Banner's section-by-CRN lookup found `crn`. Banner answers
 * `{ success: false }` for an unknown CRN; anything this can't read means
 * Banner couldn't be asked, which is null rather than a guess.
 */
export function crnLookupResult(
  crn: string,
  result: RelayedResult,
): boolean | null {
  if (!result.success) return null;
  const data = result.data as Record<string, unknown> | null | undefined;
  if (!data || typeof data !== "object") return null;
  if (data.success === false) return false;
  const section = (data.model ?? data) as Record<string, unknown> | null;
  if (section && "courseReferenceNumber" in section) {
    return String(section.courseReferenceNumber) === crn;
  }
  return null;
}

/** "28d 14h 06m 12s" until `target`, or null once it's passed. */
export function countdown(target: number, now: number): string | null {
  const left = Math.floor((target - now) / MS_PER_SECOND);
  if (left <= 0) return null;
  const days = Math.floor(left / SECONDS_PER_DAY);
  const hours = Math.floor((left % SECONDS_PER_DAY) / SECONDS_PER_HOUR);
  const minutes = Math.floor((left % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  const seconds = left % SECONDS_PER_MINUTE;
  const pad = (n: number) => String(n).padStart(2, "0");
  const time = `${hours}h ${pad(minutes)}m ${pad(seconds)}s`;
  return days > 0 ? `${days}d ${time}` : time;
}

/** Moves the CRN at `from` by `by` places, staying in bounds. */
export function moveCrn(
  crns: readonly string[],
  from: number,
  by: number,
): string[] {
  const to = from + by;
  if (to < 0 || to >= crns.length) return [...crns];
  const next = [...crns];
  const [crn] = next.splice(from, 1);
  next.splice(to, 0, crn!);
  return next;
}
