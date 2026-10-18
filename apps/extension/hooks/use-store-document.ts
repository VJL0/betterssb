import { useCallback, useEffect, useState } from "react";
import type { StoreDocuments, StoreKey } from "@workspace/shared/types/store";
import { extensionStore } from "@/lib/local-store";

/**
 * A document from the shared local store (chrome.storage.local), kept current
 * when the website, the overlay or another popup changes it.
 */
export function useStoreDocument<K extends StoreKey>(key: K) {
  const [value, setValue] = useState<StoreDocuments[K] | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      void extensionStore.get(key).then((doc) => {
        if (cancelled) return;
        setValue(doc);
        setLoaded(true);
      });
    load();
    const unsubscribe = extensionStore.subscribe((changed) => {
      if (changed === key) load();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [key]);

  const save = useCallback(
    async (next: StoreDocuments[K]) => {
      setValue(next);
      await extensionStore.set(key, next);
    },
    [key],
  );

  return { value, loaded, save };
}
