/**
 * The website's way into the extension, over `window.postMessage` on the
 * website's origin only. Just the requests `parseBridgeRequest` allows cross:
 * DARS runs, Banner status, the shared store, Banner's registration terms and
 * plans, the TUportal registration time and auto-register setup. No Banner
 * registration call crosses, and the extension checks a queue before turning
 * it on.
 */
import { AUTO_REG_RUN_STATE_KEY } from "@/lib/auto-reg-run-state";
import { AUTO_REG_QUEUE_KEY } from "@/lib/auto-reg-queue-storage";
import { BANNER_CONNECTION_KEY } from "@/lib/banner-session";
import { WEB_ORIGIN } from "@/lib/config";
import { originMatchPattern } from "@/lib/match-pattern";
import { sendMessage } from "@/lib/messaging";
import { extensionStore } from "@/lib/local-store";
import {
  BRIDGE_SOURCE,
  parseBridgeRequest,
  type BridgeEvent,
  type BridgeRequest,
  type BridgeResponse,
} from "@workspace/shared/lib/bridge";
import { isRecord } from "@workspace/shared/lib/guards";

type Reply = Omit<BridgeResponse, "source" | "dir" | "id">;

async function handle(request: BridgeRequest): Promise<Reply> {
  switch (request.type) {
    case "DARS_RUN_AUDIT":
      return sendMessage({ type: "DARS_RUN_AUDIT", payload: {} });
    case "BANNER_STATUS":
      return sendMessage({ type: "BANNER_STATUS", payload: {} });
    case "STORE_KEYS":
      return { success: true, data: await extensionStore.keys() };
    case "STORE_GET":
      return { success: true, data: await extensionStore.get(request.key) };
    case "STORE_DELETE":
      await extensionStore.delete(request.key);
      return { success: true };
    case "STORE_SET":
      await extensionStore.set(request.key, request.value);
      return { success: true };
    case "AUTOREG_GET":
    case "AUTOREG_ARM":
    case "AUTOREG_DISARM":
      return sendMessage({ type: request.type, payload: {} });
    case "AUTOREG_SAVE_QUEUE":
      return sendMessage({
        type: "AUTOREG_SAVE_QUEUE",
        payload: { queue: request.queue },
      });
    case "AUTOREG_REGISTRATION_TIME":
      return sendMessage({
        type: "AUTOREG_REGISTRATION_TIME",
        payload: { term: request.term },
      });
    // Read-only Banner lookups; nothing that registers crosses the bridge.
    case "BANNER_REG_TERMS":
      return sendMessage({ type: "SSB_REG_GET_TERMS", payload: {} });
    case "BANNER_REG_PLANS":
      return sendMessage({
        type: "SSB_REG_GET_PLANS",
        payload: { term: request.term },
      });
  }
}

function hasRequestId(data: unknown): data is { id: string } {
  return (
    isRecord(data) &&
    data.source === BRIDGE_SOURCE &&
    data.dir === "request" &&
    typeof data.id === "string"
  );
}

export default defineContentScript({
  // Only the website (WXT_WEB_ORIGIN): any page here can drive the bridge.
  matches: [originMatchPattern(WEB_ORIGIN)],

  main() {
    const origin = window.location.origin;

    // Lets the page detect that the extension is installed.
    document.documentElement.dataset.betterssbExtension =
      browser.runtime.getManifest().version;

    extensionStore.subscribe((key) => {
      const event: BridgeEvent = {
        source: BRIDGE_SOURCE,
        dir: "event",
        type: "STORE_CHANGED",
        key,
      };
      window.postMessage(event, origin);
    });

    // The website refreshes auto-register when it's armed, run or edited elsewhere.
    browser.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (AUTO_REG_RUN_STATE_KEY in changes || AUTO_REG_QUEUE_KEY in changes) {
        const event: BridgeEvent = {
          source: BRIDGE_SOURCE,
          dir: "event",
          type: "AUTOREG_CHANGED",
        };
        window.postMessage(event, origin);
      }
      // The student signed in to or out of Banner.
      if (BANNER_CONNECTION_KEY in changes) {
        const event: BridgeEvent = {
          source: BRIDGE_SOURCE,
          dir: "event",
          type: "BANNER_CHANGED",
        };
        window.postMessage(event, origin);
      }
    });

    window.addEventListener("message", async (event: MessageEvent) => {
      if (event.source !== window || !hasRequestId(event.data)) return;
      const { id } = event.data;
      const reply = (res: Reply) => {
        const response: BridgeResponse = {
          source: BRIDGE_SOURCE,
          dir: "response",
          id,
          ...res,
        };
        window.postMessage(response, origin);
      };

      const parsed = parseBridgeRequest(event.data);
      if (!parsed) {
        reply({ success: false, error: "That request isn't allowed." });
        return;
      }
      try {
        reply(await handle(parsed.request));
      } catch (err) {
        reply({
          success: false,
          error:
            err instanceof Error ? err.message : "Extension request failed",
        });
      }
    });
  },
});
