import { useCallback, useMemo } from "react";
import { DEFAULT_PLAN_PREFERENCES } from "@workspace/shared/lib/plan-optimizer";
import type { PlanPreferences } from "@workspace/shared/types/store";
import { useStoreDocument } from "@/lib/store/store-context";

/** What "Optimize plan" remembers, with defaults until it's saved. */
export function usePlanPreferences() {
  const doc = useStoreDocument("planPreferences");
  const preferences: PlanPreferences = useMemo(
    () => ({ ...DEFAULT_PLAN_PREFERENCES, updatedAt: "", ...doc.value }),
    [doc.value],
  );
  const { save } = doc;

  const update = useCallback(
    (patch: Partial<Omit<PlanPreferences, "updatedAt">>) =>
      save({ ...preferences, ...patch, updatedAt: new Date().toISOString() }),
    [save, preferences],
  );

  return { preferences, update };
}
