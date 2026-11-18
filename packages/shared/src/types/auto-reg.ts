/**
 * Auto-register as the website sees it through the extension bridge. The
 * extension keeps the queue and the armed flag in chrome.storage.local and
 * runs the batch from a one-shot alarm, with the student's own Banner sign-in.
 */
import type { AutoRegBatchResultRecord } from "../lib/auto-reg-batch-result";

export interface AutoRegQueue {
  /** Banner term code, e.g. "202703". */
  term: string;
  /** CRNs as they were added. Banner gets them all in one submit. */
  crns: string[];
  /** When to submit, as a `datetime-local` value in the computer's time zone. */
  scheduledRunAt: string;
}

export interface AutoRegSnapshot extends AutoRegQueue {
  armed: boolean;
  /** The last batch's outcome, if one has run. */
  lastResult: AutoRegBatchResultRecord | null;
}

/**
 * The student's registration time for a term, as TUportal's priority
 * registration countdown has it. `startsAt` is an ISO instant.
 */
export type RegistrationTimeLookup =
  | { status: "found"; startsAt: string }
  | { status: "not-listed" }
  | { status: "signed-out" };

/** Whether Banner knows a CRN in the term; null when Banner couldn't be asked. */
export interface CrnCheck {
  crn: string;
  found: boolean | null;
}
