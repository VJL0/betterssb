import { hasDataConsent } from "@/lib/data-consent";
import { onMessage } from "@/lib/messaging";
import { BANNER_PAGES } from "@/lib/temple-urls";
import { restartBannerPageTimer } from "./keep-alive";

/**
 * Banner pages: the ratings overlay. Banner calls themselves run
 * in the background with the student's cookies, so this tab isn't needed for
 * them; it only restarts its idle timer while a run is armed.
 */
export default defineContentScript({
  matches: [BANNER_PAGES],

  async main() {
    // The overlay sends instructor names to the API, so it waits for consent.
    if (!(await hasDataConsent())) return;
    const { startOverlay } = await import("./overlay");

    onMessage((msg, sendResponse) => {
      switch (msg.type) {
        case "BANNER_RESTART_TIMER":
          restartBannerPageTimer();
          sendResponse({ success: true });
          return;
      }
    });

    startOverlay();
  },
});
