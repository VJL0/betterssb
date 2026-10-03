/**
 * Talks to the BetterSSB browser extension, when it's installed.
 *
 * The extension runs the audit inside the student's own browser, using the
 * DARS session they're already signed into — no credential ever reaches this
 * site or the server. We just ask for the finished audit HTML and parse it.
 */
import { parseAuditHtml, type Audit } from "./dars";

const BRIDGE = "betterssb-bridge";
const AUDIT_TIMEOUT_MS = 170_000;

interface BridgeResponse {
  source: typeof BRIDGE;
  dir: "response";
  id: string;
  success: boolean;
  data?: { html?: string };
  error?: string;
}

function isBridgeResponse(data: unknown, id: string): data is BridgeResponse {
  const d = data as Partial<BridgeResponse> | null;
  return !!d && d.source === BRIDGE && d.dir === "response" && d.id === id;
}

/** The installed extension's version, or null if it isn't present on this page. */
export function extensionVersion(): string | null {
  return document.documentElement.dataset.betterssbExtension ?? null;
}

/** Resolves once the extension announces itself (it sets a marker on load). */
export function waitForExtension(timeoutMs = 1500): Promise<string | null> {
  return new Promise((resolve) => {
    const found = extensionVersion();
    if (found) return resolve(found);
    const started = Date.now();
    const timer = setInterval(() => {
      const v = extensionVersion();
      if (v || Date.now() - started >= timeoutMs) {
        clearInterval(timer);
        resolve(v);
      }
    }, 150);
  });
}

function requestAuditHtml(): Promise<string> {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("The extension didn't respond. Is DARS signed in?"));
    }, AUDIT_TIMEOUT_MS);

    function onMessage(event: MessageEvent) {
      if (event.source !== window || !isBridgeResponse(event.data, id)) return;
      cleanup();
      const { success, data, error } = event.data;
      if (success && data?.html) resolve(data.html);
      else reject(new Error(error || "The audit failed."));
    }
    function cleanup() {
      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
    }

    window.addEventListener("message", onMessage);
    window.postMessage(
      { source: BRIDGE, dir: "request", id, type: "DARS_RUN_AUDIT" },
      window.location.origin,
    );
  });
}

/** Asks the extension to run a fresh audit, then parses the result. */
export async function runViaExtension(): Promise<Audit> {
  return parseAuditHtml(await requestAuditHtml());
}
