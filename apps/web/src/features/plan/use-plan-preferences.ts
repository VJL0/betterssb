import { DEFAULT_PLAN_PREFERENCES } from "@workspace/shared/lib/plan-optimizer";
import type { PlanPreferences } from "@workspace/shared/types/store";
import { useStoreDocument } from "@/lib/store/store-context";

/** What "Auto-fill plan" remembers, with defaults until it's saved. */
export function usePlanPreferences() {
  const doc = useStoreDocument("planPreferences");
  const preferences: PlanPreferences = {
    ...DEFAULT_PLAN_PREFERENCES,
    updatedAt: "",
    ...doc.value,
  };

  return {
    preferences,
    update: (patch: Partial<Omit<PlanPreferences, "updatedAt">>) =>
      doc.save({
        ...preferences,
        ...patch,
        updatedAt: new Date().toISOString(),
      }),
  };
}
