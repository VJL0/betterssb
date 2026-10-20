import { onContentMessage } from "@/lib/messaging";
import { overlayStatus } from "@/lib/overlay-status";
import type { ExtensionMessage, ExtensionResponse } from "@/lib/messaging";
import * as ssb from "@/lib/ssb-api";
import { BANNER_PAGES } from "@/lib/temple-urls";

async function handleSSBMessage(
  msg: ExtensionMessage,
): Promise<ExtensionResponse> {
  switch (msg.type) {
    case "SSB_REG_GET_TERMS": {
      const data = await ssb.getRegistrationTerms();
      return { success: true, data };
    }
    case "SSB_REG_GET_PLANS": {
      const data = await ssb.getPlans();
      return { success: true, data };
    }
    case "SSB_REG_GET_SECTION_CRN": {
      const { crn, term } = msg.payload as { crn: string; term: string };
      const data = await ssb.getSectionDetailsFromCRN(crn, term);
      return { success: true, data };
    }
    case "SSB_AUTO_REGISTER_RUN": {
      const { term, crnList } = msg.payload as {
        term: string;
        crnList: string[];
      };
      const result = await ssb.executeRegistrationSubmit(term, crnList);
      return { success: true, data: result };
    }
    default:
      return { success: false, error: `Unknown SSB message: ${msg.type}` };
  }
}

export default defineContentScript({
  matches: [BANNER_PAGES],

  async main() {
    const { startOverlay } = await import("./overlay");

    onContentMessage(async (msg, sendResponse) => {
      if (msg.type === "OVERLAY_STATUS") {
        sendResponse({ success: true, data: overlayStatus() });
        return;
      }
      if (msg.type.startsWith("SSB_")) {
        try {
          const result = await handleSSBMessage(msg);
          sendResponse(result);
        } catch (err) {
          sendResponse({
            success: false,
            error: err instanceof Error ? err.message : "SSB request failed",
          });
        }
      }
    });

    startOverlay();
  },
});
