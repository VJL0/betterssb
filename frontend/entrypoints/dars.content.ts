import { onContentMessage } from "@/lib/messaging";
import { runAudit, DarsSessionExpiredError } from "@/lib/dars-api";

/**
 * Content script for DARS (u.achieve self-service). It does nothing on load;
 * it only runs an audit when the popup/web app asks via a DARS_RUN_AUDIT
 * message, using the student's own in-browser session.
 */
export default defineContentScript({
  matches: ["*://prd-dars.temple.edu/selfservice/*"],

  main() {
    onContentMessage(async (msg, sendResponse) => {
      if (msg.type !== "DARS_RUN_AUDIT") return;
      try {
        const html = await runAudit();
        sendResponse({ success: true, data: { html } });
      } catch (err) {
        sendResponse({
          success: false,
          error:
            err instanceof DarsSessionExpiredError || err instanceof Error
              ? err.message
              : "DARS audit failed",
        });
      }
    });
  },
});
