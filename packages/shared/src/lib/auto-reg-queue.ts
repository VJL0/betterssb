/**
 * Rules for the auto-register queue that both the extension (which enforces
 * them before arming) and the website (which explains them) apply.
 */
import type { AutoRegQueue, AutoRegSnapshot } from "../types/auto-reg";
import { isResultRecord } from "./auto-reg-batch-result";
import { isRecord } from "./guards";

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 60 * SECONDS_PER_MINUTE;
const SECONDS_PER_DAY = 24 * SECONDS_PER_HOUR;

/** Why the queue can't be armed yet, or null when it can. */
export function armProblem(queue: AutoRegQueue, now: number): string | null {
  if (!queue.term) return "Choose a term.";
  if (queue.crns.length === 0) return "Add at least one CRN.";
  if (!queue.scheduledRunAt) return "Set your registration time.";
  const at = new Date(queue.scheduledRunAt).getTime();
  if (!Number.isFinite(at)) return "Set your registration time.";
  if (at <= now) return "That time has passed. Pick a later one.";
  return null;
}

/**
 * Whether Banner's section-by-CRN lookup found the CRN. Banner answers the
 * section's course (`{ courseTitle, subject, …, success: true }`) or
 * `{ success: false }`; an answer this can't read is null rather than a guess.
 */
export function crnLookupResult(answer: unknown): boolean | null {
  if (!isRecord(answer)) return null;
  if (answer.success === false) return false;
  if (answer.success === true && typeof answer.courseTitle === "string") {
    return true;
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

export function isAutoRegSnapshot(value: unknown): value is AutoRegSnapshot {
  return (
    isRecord(value) &&
    typeof value.term === "string" &&
    Array.isArray(value.crns) &&
    value.crns.every((crn) => typeof crn === "string") &&
    typeof value.scheduledRunAt === "string" &&
    typeof value.armed === "boolean" &&
    (value.lastResult === null || isResultRecord(value.lastResult))
  );
}
