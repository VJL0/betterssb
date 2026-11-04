import {
  isResultRecord,
  type AutoRegBatchResultRecord,
} from "@workspace/shared/lib/auto-reg-batch-result";
import { isRecord } from "@workspace/shared/lib/guards";
import { getStorageItem, setStorageItem } from "@/lib/storage";

export const AUTO_REG_RUN_STATE_KEY = "betterssb:autoRegRunState";

/**
 * The auto-register lifecycle: the armed flag, the run already started, the
 * last run's result, and the run time a reminder was already shown for.
 */
export interface AutoRegRunState {
  /** True while the one-shot run alarm is set. */
  armed: boolean;
  /** Key of the run already started; matches `dedupeRunKeyOf` in the background script. */
  dedupeRunKey: string;
  lastResult: AutoRegBatchResultRecord | null;
  /** The `scheduledRunAt` a reminder was already shown for. */
  reminderForScheduledRunAt: string;
}

const DEFAULT_AUTO_REG_RUN_STATE: AutoRegRunState = {
  armed: false,
  dedupeRunKey: "",
  lastResult: null,
  reminderForScheduledRunAt: "",
};

function normalizeRunState(raw: unknown): AutoRegRunState {
  if (!isRecord(raw) || typeof raw.armed !== "boolean") {
    return { ...DEFAULT_AUTO_REG_RUN_STATE };
  }
  return {
    armed: raw.armed,
    dedupeRunKey: typeof raw.dedupeRunKey === "string" ? raw.dedupeRunKey : "",
    lastResult: isResultRecord(raw.lastResult) ? raw.lastResult : null,
    reminderForScheduledRunAt:
      typeof raw.reminderForScheduledRunAt === "string"
        ? raw.reminderForScheduledRunAt
        : "",
  };
}

export async function getAutoRegRunState(): Promise<AutoRegRunState> {
  return normalizeRunState(await getStorageItem(AUTO_REG_RUN_STATE_KEY));
}

export async function patchAutoRegRunState(
  patch: Partial<AutoRegRunState>,
): Promise<AutoRegRunState> {
  const next: AutoRegRunState = { ...(await getAutoRegRunState()), ...patch };
  await setStorageItem(AUTO_REG_RUN_STATE_KEY, next);
  return next;
}
