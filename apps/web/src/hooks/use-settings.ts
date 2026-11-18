import { settingsOrDefaults } from "@workspace/shared/lib/store";
import type { UserSettings } from "@workspace/shared/types/store";
import { useStoreDocument } from "@/lib/store/store-context";

/** The student's settings, with defaults until they've saved any. */
export function useSettings() {
  const doc = useStoreDocument("settings");
  const settings: UserSettings = settingsOrDefaults(doc.value);

  return {
    settings,
    hasSaved: doc.value !== null,
    status: doc.status,
    update: (patch: Partial<Omit<UserSettings, "updatedAt">>) =>
      doc.save({
        ...settings,
        ...patch,
        updatedAt: new Date().toISOString(),
      }),
  };
}
