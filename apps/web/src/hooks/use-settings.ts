import { useCallback, useMemo } from "react";
import { DEFAULT_SETTINGS } from "@workspace/shared/lib/store";
import type { UserSettings } from "@workspace/shared/types/store";
import { useStoreDocument } from "@/lib/store/store-context";

/** The student's settings, with defaults until they've saved any. */
export function useSettings() {
  const doc = useStoreDocument("settings");
  const settings: UserSettings = useMemo(
    () => doc.value ?? { ...DEFAULT_SETTINGS, updatedAt: "" },
    [doc.value],
  );
  const { save } = doc;

  const update = useCallback(
    (patch: Partial<Omit<UserSettings, "updatedAt">>) =>
      save({
        ...settings,
        ...patch,
        updatedAt: new Date().toISOString(),
      }),
    [save, settings],
  );

  return {
    settings,
    hasSaved: doc.value !== null,
    status: doc.status,
    update,
  };
}
