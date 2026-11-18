import { useEffect, useState } from "react";
import type { BannerConnection } from "@workspace/shared/types/store";
import {
  getBannerConnection,
  onBannerChange,
  waitForExtension,
} from "@/lib/extension";

/** Each check asks Banner, so a visible page rechecks this often. */
const RECHECK_MS = 30_000;

export interface BannerState {
  /** Null until the first check finishes. */
  connection: BannerConnection | null;
  extensionInstalled: boolean;
}

/**
 * Whether the student is signed in to Banner, live: checked on mount, every
 * 30 seconds while the page is visible, when it regains focus, and as soon
 * as the extension sees a change. Only pages that use sign-in call this.
 */
export function useBannerConnection(): BannerState {
  // The extension can only be seen in the browser, so the prerendered page
  // and the first render assume it's absent; the first check settles both.
  const [state, setState] = useState<BannerState>({
    connection: null,
    extensionInstalled: false,
  });

  useEffect(() => {
    // Unmounting stops the extension check, which reads the page.
    const unmounted = new AbortController();
    // Checks can overlap; only the newest one's answer is kept.
    let latest = 0;
    async function check() {
      latest += 1;
      const id = latest;
      const installed = (await waitForExtension(unmounted.signal)) !== null;
      if (unmounted.signal.aborted) return;
      const connection = await getBannerConnection().catch(
        (): BannerConnection => "not-connected",
      );
      if (!unmounted.signal.aborted && id === latest) {
        setState({ connection, extensionInstalled: installed });
      }
    }
    const checkIfVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    void check();
    const stopListening = onBannerChange(() => void check());
    document.addEventListener("visibilitychange", checkIfVisible);
    window.addEventListener("focus", checkIfVisible);
    const timer = setInterval(checkIfVisible, RECHECK_MS);
    return () => {
      unmounted.abort();
      stopListening();
      document.removeEventListener("visibilitychange", checkIfVisible);
      window.removeEventListener("focus", checkIfVisible);
      clearInterval(timer);
    };
  }, []);

  return state;
}
