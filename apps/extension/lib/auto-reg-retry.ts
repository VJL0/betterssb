import { BannerSignedOutError } from "@/lib/ssb-api";
import { sleep } from "@/lib/sleep";

/**
 * Banner can open registration a few seconds after the scheduled time (or
 * the computer's clock runs ahead), and it errors under the rush when
 * registration opens, so a failed submit is tried again for this long.
 */
export const AUTO_REG_RETRY_WINDOW_MS = 60_000;
export const AUTO_REG_RETRY_DELAY_MS = 2_000;

export type SubmitOutcome<T> =
  | { status: "submitted"; result: T }
  | { status: "failed"; error: Error }
  | { status: "stopped" };

function asError(err: unknown): Error {
  return err instanceof Error ? err : new Error("Banner request failed");
}

/** No later attempt can succeed until the student signs back in. */
function isWorthRetrying(error: Error): boolean {
  return !(error instanceof BannerSignedOutError);
}

/**
 * Runs `submit`, trying again after a failure until the retry window ends.
 * Only a thrown error is retried: once Banner answers the batch, each CRN's
 * outcome is final. `stillArmed` is checked before each retry, so turning
 * auto-register off stops it.
 */
export async function submitWithRetry<T>(
  submit: () => Promise<T>,
  stillArmed: () => Promise<boolean>,
): Promise<SubmitOutcome<T>> {
  const deadline = Date.now() + AUTO_REG_RETRY_WINDOW_MS;
  for (;;) {
    try {
      return { status: "submitted", result: await submit() };
    } catch (err) {
      const error = asError(err);
      if (!isWorthRetrying(error) || Date.now() >= deadline) {
        return { status: "failed", error };
      }
    }
    await sleep(AUTO_REG_RETRY_DELAY_MS);
    if (!(await stillArmed())) return { status: "stopped" };
  }
}
