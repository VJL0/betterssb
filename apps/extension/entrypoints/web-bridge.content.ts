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
 * read the Banner connection status, and read and write the shared local
 * store, so guest plans are the same in the website and the extension. Only
 * the requests `parseBridgeRequest` allows cross; no Banner registration call
 * does. Communication uses `window.postMessage` on this origin.
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
