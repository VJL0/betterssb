import { useCallback, useEffect, useState } from "react";
import {
  AUTO_REG_SCHEDULE_CONFIG_KEY,
  DEFAULT_AUTO_REG_SCHEDULE_CONFIG,
  getAutoRegScheduleConfig,
  normalizeScheduleConfig,
  patchAutoRegScheduleConfig,
  type AutoRegScheduleConfig,
} from "@/lib/auto-reg-schedule-config";

export function useAutoRegScheduleConfig(): [
  AutoRegScheduleConfig,
  (patch: Partial<AutoRegScheduleConfig>) => Promise<void>,
  boolean,
] {
  const [value, setValueState] = useState<AutoRegScheduleConfig>(
    DEFAULT_AUTO_REG_SCHEDULE_CONFIG,
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    getAutoRegScheduleConfig().then((stored) => {
      if (!cancelled) {
        setValueState(stored);
        setLoading(false);
      }
    });

    const listener = (
      changes: Record<string, chrome.storage.StorageChange>,
    ) => {
      if (AUTO_REG_SCHEDULE_CONFIG_KEY in changes) {
        const raw = changes[AUTO_REG_SCHEDULE_CONFIG_KEY].newValue;
        if (raw !== undefined && raw !== null) {
          setValueState(normalizeScheduleConfig(raw));
        }
      }
    };

    chrome.storage.local.onChanged.addListener(listener);
    return () => {
      cancelled = true;
      chrome.storage.local.onChanged.removeListener(listener);
    };
  }, []);

  const patch = useCallback(
    async (partial: Partial<AutoRegScheduleConfig>) => {
      const next = await patchAutoRegScheduleConfig(partial);
      setValueState(next);
    },
    [],
  );

  return [value, patch, loading];
}
