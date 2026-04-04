import { getStorageItem, setStorageItem } from "@/lib/storage";

export const AUTO_REG_RUN_STATE_KEY = "betterssb:autoRegRunState";

/**
 * Ephemeral auto-register lifecycle: armed flag, idempotency key, last batch
 * payload, and reminder dedupe (mirrors `scheduledRunAt` string when sent).
 */
export interface AutoRegRunState {
  /** True when the one-shot alarm is scheduled (user hit Activate). */
  armed: boolean;
  /** Fingerprint of the batch already started — matches `buildBatchDedupeKey` in the background script. */
  dedupeRunKey: string;
  /** Serialized `AutoRegBatchResultRecord` JSON. */
  lastBatchResultJson: string;
  /** `scheduledRunAt` value we already showed a pre-window reminder for. */
  reminderForScheduledRunAt: string;
}

export const DEFAULT_AUTO_REG_RUN_STATE: AutoRegRunState = {
  armed: false,
  dedupeRunKey: "",
  lastBatchResultJson: "",
  reminderForScheduledRunAt: "",
};

export function normalizeRunState(raw: unknown): AutoRegRunState {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_AUTO_REG_RUN_STATE };
  const o = raw as Record<string, unknown>;
  if (typeof o.armed !== "boolean") return { ...DEFAULT_AUTO_REG_RUN_STATE };
  return {
    armed: o.armed,
    dedupeRunKey: typeof o.dedupeRunKey === "string" ? o.dedupeRunKey : "",
    lastBatchResultJson:
      typeof o.lastBatchResultJson === "string" ? o.lastBatchResultJson : "",
    reminderForScheduledRunAt:
      typeof o.reminderForScheduledRunAt === "string"
        ? o.reminderForScheduledRunAt
        : "",
  };
}

export async function getAutoRegRunState(): Promise<AutoRegRunState> {
  const stored = await getStorageItem<unknown>(AUTO_REG_RUN_STATE_KEY);
  if (stored === null) {
    return { ...DEFAULT_AUTO_REG_RUN_STATE };
  }
  return normalizeRunState(stored);
}

export async function patchAutoRegRunState(
  patch: Partial<AutoRegRunState>,
): Promise<AutoRegRunState> {
  const current = await getAutoRegRunState();
  const next: AutoRegRunState = {
    ...current,
    ...patch,
  };
  await setStorageItem(AUTO_REG_RUN_STATE_KEY, next);
  return next;
}
