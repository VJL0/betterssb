/**
 * Auto-register as the website sees it through the extension bridge. The
 * extension keeps the queue and the armed flag in chrome.storage.local and
 * runs the batch from a one-shot alarm in the student's own Banner tab.
 */
import type { AutoRegBatchResultRecord } from "../lib/auto-reg-batch-result";

export interface AutoRegQueue {
  /** Banner term code, e.g. "202703". */
  term: string;
  /** CRNs in the order they're submitted. */
  crns: string[];
  /** When to submit, as a `datetime-local` value in the computer's time zone. */
  scheduledRunAt: string;
}

export interface AutoRegSnapshot extends AutoRegQueue {
  armed: boolean;
  /** The last batch's outcome, if one has run. */
  lastResult: AutoRegBatchResultRecord | null;
}

/** Whether Banner knows a CRN in the term; null when Banner couldn't be asked. */
export interface CrnCheck {
  crn: string;
  found: boolean | null;
}
