import { AUTO_REG_RUN_STATE_KEY } from "@/lib/auto-reg-run-state";
import { AUTO_REG_SCHEDULE_CONFIG_KEY } from "@/lib/auto-reg-schedule-config";
import { sendMessage } from "@/lib/messaging";
import { extensionStore } from "@/lib/local-store";
import {
  BRIDGE_SOURCE,
  parseBridgeRequest,
  type BridgeEvent,
  type BridgeRequest,
  type BridgeResponse,
} from "@workspace/shared/lib/bridge";
import type { StoreDocuments, StoreKey } from "@workspace/shared/types/store";

/**
 * Bridge between the BetterSSB website and the extension.
 *
 * Injected only on the web app's own origin. The site can run a DARS audit,
 * read the Banner connection status, read and write the shared local store
 * (so guest plans are the same in the website and the extension), read
 * Banner's registration terms and plans and the student's TUportal
 * registration time, and set up, arm and disarm auto-register. Only the
 * requests `parseBridgeRequest` allows cross; no Banner registration call
 * does, and the extension checks a queue before it can be armed.
 * Communication uses `window.postMessage` on this origin.
 */

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
      await extensionStore.set(
        request.key,
        request.value as StoreDocuments[StoreKey],
      );
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
    case "AUTOREG_CHECK_CRNS":
      return sendMessage({
        type: "AUTOREG_CHECK_CRNS",
        payload: { term: request.term, crns: request.crns },
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
      return sendMessage({ type: "SSB_REG_GET_PLANS", payload: {} });
  }
}

function hasRequestId(data: unknown): data is { id: string } {
  const d = data as { source?: unknown; dir?: unknown; id?: unknown } | null;
  return (
    !!d &&
    d.source === BRIDGE_SOURCE &&
    d.dir === "request" &&
    typeof d.id === "string"
  );
}

export default defineContentScript({
  // The website. Match patterns ignore the port, so this covers any localhost dev port.
  // Add the production web origin here before deploying.
  matches: ["*://localhost/*", "*://127.0.0.1/*"],

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
      if (
        AUTO_REG_RUN_STATE_KEY in changes ||
        AUTO_REG_SCHEDULE_CONFIG_KEY in changes
      ) {
        const event: BridgeEvent = {
          source: BRIDGE_SOURCE,
          dir: "event",
          type: "AUTOREG_CHANGED",
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
