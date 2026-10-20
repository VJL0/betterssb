import { useEffect, useState } from "react";
import type { BannerConnection } from "@workspace/shared/types/store";
import { getBannerConnection, waitForExtension } from "@/lib/extension";

/** Banner can change without the page knowing (a tab opened or timed out). */
const RECHECK_MS = 60_000;

export interface BannerState {
  /** Null until the first check finishes. */
  connection: BannerConnection | null;
  extensionInstalled: boolean;
}

/** The Banner connection, rechecked when the page regains focus and every minute. */
export function useBannerConnection(): BannerState {
  // The extension can only be seen in the browser, so the prerendered page
  // and the first render assume it's absent; the first check settles both.
  const [state, setState] = useState<BannerState>({
    connection: null,
    extensionInstalled: false,
  });

  useEffect(() => {
    let cancelled = false;
    async function check() {
      const installed = (await waitForExtension()) !== null;
      const connection = await getBannerConnection().catch(
        (): BannerConnection => "not-connected",
      );
      if (!cancelled) setState({ connection, extensionInstalled: installed });
    }
    void check();
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    const timer = setInterval(() => void check(), RECHECK_MS);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      clearInterval(timer);
    };
  }, []);

  return state;
}
