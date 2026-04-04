import { useCallback, useEffect, useState } from "react";
import {
  AUTO_REG_RUN_STATE_KEY,
  DEFAULT_AUTO_REG_RUN_STATE,
  getAutoRegRunState,
  normalizeRunState,
  patchAutoRegRunState,
  type AutoRegRunState,
} from "@/lib/auto-reg-run-state";

export function useAutoRegRunState(): [
  AutoRegRunState,
  (patch: Partial<AutoRegRunState>) => Promise<void>,
  boolean,
] {
  const [value, setValueState] = useState<AutoRegRunState>(
    DEFAULT_AUTO_REG_RUN_STATE,
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    getAutoRegRunState().then((stored) => {
      if (!cancelled) {
        setValueState(stored);
        setLoading(false);
      }
    });

    const listener = (
      changes: Record<string, chrome.storage.StorageChange>,
    ) => {
      if (AUTO_REG_RUN_STATE_KEY in changes) {
        const raw = changes[AUTO_REG_RUN_STATE_KEY].newValue;
        if (raw !== undefined && raw !== null) {
          setValueState(normalizeRunState(raw));
        }
      }
    };

    chrome.storage.local.onChanged.addListener(listener);
    return () => {
      cancelled = true;
      chrome.storage.local.onChanged.removeListener(listener);
    };
  }, []);

  const patch = useCallback(async (partial: Partial<AutoRegRunState>) => {
    const next = await patchAutoRegRunState(partial);
    setValueState(next);
  }, []);

  return [value, patch, loading];
}
