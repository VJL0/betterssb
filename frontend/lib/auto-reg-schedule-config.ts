import { getStorageItem, setStorageItem } from "@/lib/storage";

export const AUTO_REG_SCHEDULE_CONFIG_KEY = "betterssb:autoRegScheduleConfig";

/**
 * Persisted inputs for the auto-register batch: term, CRNs, when to run, and
 * how the popup derives CRNs (plan vs manual).
 */
export interface AutoRegScheduleConfig {
  term: string;
  /** Comma-/whitespace-separated Banner CRNs. */
  crns: string;
  /** `datetime-local` value — when the one-shot batch alarm should fire. */
  scheduledRunAt: string;
  /** SSB registration plan id (string for &lt;select&gt; value). */
  planId: string;
  manualMode: boolean;
}

export const DEFAULT_AUTO_REG_SCHEDULE_CONFIG: AutoRegScheduleConfig = {
  term: "",
  crns: "",
  scheduledRunAt: "",
  planId: "",
  manualMode: false,
};

export function normalizeScheduleConfig(raw: unknown): AutoRegScheduleConfig {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_AUTO_REG_SCHEDULE_CONFIG };
  const o = raw as Record<string, unknown>;
  if (
    typeof o.term !== "string" ||
    typeof o.crns !== "string" ||
    typeof o.scheduledRunAt !== "string"
  ) {
    return { ...DEFAULT_AUTO_REG_SCHEDULE_CONFIG };
  }
  return {
    term: o.term,
    crns: o.crns,
    scheduledRunAt: o.scheduledRunAt,
    planId: typeof o.planId === "string" ? o.planId : "",
    manualMode: typeof o.manualMode === "boolean" ? o.manualMode : false,
  };
}

export async function getAutoRegScheduleConfig(): Promise<AutoRegScheduleConfig> {
  const stored = await getStorageItem<unknown>(AUTO_REG_SCHEDULE_CONFIG_KEY);
  return normalizeScheduleConfig(stored);
}

export async function patchAutoRegScheduleConfig(
  patch: Partial<AutoRegScheduleConfig>,
): Promise<AutoRegScheduleConfig> {
  const current = await getAutoRegScheduleConfig();
  const next: AutoRegScheduleConfig = {
    ...current,
    ...patch,
  };
  await setStorageItem(AUTO_REG_SCHEDULE_CONFIG_KEY, next);
  return next;
}
