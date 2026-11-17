import { useEffect, useState } from "react";
import { waitForExtension } from "@/lib/extension";

/**
 * Whether the BetterSSB extension is in this browser. False until the first
 * check finishes, since the prerendered page can't see the extension.
 */
export function useExtensionInstalled(): boolean {
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    // Unmounting stops the check, which reads the page.
    const unmounted = new AbortController();
    void waitForExtension(unmounted.signal).then((version) => {
      if (!unmounted.signal.aborted) setInstalled(version !== null);
    });
    return () => unmounted.abort();
  }, []);

  return installed;
}
