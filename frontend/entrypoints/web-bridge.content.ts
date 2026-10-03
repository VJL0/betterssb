import { sendMessage, type MessageType } from "@/lib/messaging";

/**
 * Bridge between the BetterSSB website and the extension.
 *
 * Injected only on the web app's own origin. It lets the site ask the
 * extension to run a DARS audit (which happens in the student's own browser
 * session) without the site ever handling a credential. Communication uses
 * `window.postMessage`; only the audit action is exposed, nothing else.
 */
const BRIDGE = "betterssb-bridge";
const ALLOWED: ReadonlySet<MessageType> = new Set(["DARS_RUN_AUDIT"]);

interface BridgeRequest {
  source: typeof BRIDGE;
  dir: "request";
  id: string;
  type: MessageType;
  payload?: unknown;
}

function isBridgeRequest(data: unknown): data is BridgeRequest {
  const d = data as Partial<BridgeRequest> | null;
  return (
    !!d &&
    d.source === BRIDGE &&
    d.dir === "request" &&
    typeof d.id === "string" &&
    typeof d.type === "string"
  );
}

export default defineContentScript({
  // The website. Match patterns ignore the port, so this covers any localhost dev port.
  // Add the production web origin here before deploying.
  matches: ["*://localhost/*", "*://127.0.0.1/*"],

  main() {
    // Lets the page detect that the extension is installed.
    document.documentElement.dataset.betterssbExtension =
      browser.runtime.getManifest().version;

    window.addEventListener("message", async (event: MessageEvent) => {
      if (event.source !== window || !isBridgeRequest(event.data)) return;
      const { id, type, payload } = event.data;

      const reply = (res: {
        success: boolean;
        data?: unknown;
        error?: string;
      }) =>
        window.postMessage(
          { source: BRIDGE, dir: "response", id, ...res },
          "*",
        );

      if (!ALLOWED.has(type)) {
        reply({ success: false, error: `Not allowed: ${type}` });
        return;
      }
      try {
        reply(await sendMessage({ type, payload }));
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
