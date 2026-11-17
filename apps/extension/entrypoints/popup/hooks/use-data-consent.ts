import { useEffect, useState } from "react";
import { DATA_CONSENT_KEY, hasDataConsent } from "@/lib/data-consent";

/** Whether the student has agreed to the data disclosure; null while it loads. */
export function useDataConsent(): boolean | null {
  const [consented, setConsented] = useState<boolean | null>(null);

  useEffect(() => {
    const load = () => void hasDataConsent().then(setConsented);
    load();
    const onChanged = (changes: Record<string, unknown>) => {
      if (DATA_CONSENT_KEY in changes) load();
    };
    browser.storage.local.onChanged.addListener(onChanged);
    return () => browser.storage.local.onChanged.removeListener(onChanged);
  }, []);

  return consented;
}
