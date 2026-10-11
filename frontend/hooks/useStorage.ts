import { useState, useEffect, useCallback } from "react";
import { getStorageItem, setStorageItem } from "@/lib/storage";

export function useStorage<T>(
  key: string,
  defaultValue: T,
): [T, (value: T) => Promise<void>, boolean] {
  const [value, setValueState] = useState<T>(defaultValue);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    getStorageItem<T>(key).then((stored) => {
      if (!cancelled) {
        setValueState(stored ?? defaultValue);
        setLoading(false);
      }
    });

    const listener = (
      changes: Record<string, Browser.storage.StorageChange>,
    ) => {
      if (key in changes) {
        setValueState((changes[key]?.newValue as T) ?? defaultValue);
      }
    };

    browser.storage.local.onChanged.addListener(listener);
    return () => {
      cancelled = true;
      browser.storage.local.onChanged.removeListener(listener);
    };
  }, [key, defaultValue]);

  const setValue = useCallback(
    async (newValue: T) => {
      setValueState(newValue);
      await setStorageItem(key, newValue);
    },
    [key],
  );

  return [value, setValue, loading];
}
