/**
 * Talks to the BetterSSB browser extension, when it's installed.
 *
 * The extension's web-bridge content script answers `window.postMessage`
 * requests on this origin (see @workspace/shared/lib/bridge). Through it the
 * site runs DARS audits in the student's own session, reads the Banner
 * connection, and shares the extension's local store. No credential ever
 * reaches this site or the server.
 */
import {
  BRIDGE_SOURCE,
  isBridgeEvent,
  isBridgeResponse,
  type BridgeRequest,
} from "@workspace/shared/lib/bridge";
import type { Audit } from "@workspace/shared/types/dars";
import type { BannerConnection, StoreKey } from "@workspace/shared/types/store";
import { parseAuditHtml } from "./api/dars";

const DEFAULT_TIMEOUT_MS = 5_000;
// A DARS run can wait for the student to finish signing in to DARS.
const AUDIT_TIMEOUT_MS = 170_000;
const DETECT_TIMEOUT_MS = 1_500;
const DETECT_POLL_MS = 150;

export class ExtensionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtensionError";
  }
}

/** The installed extension's version, or null if it isn't present on this page. */
export function extensionVersion(): string | null {
  return document.documentElement.dataset.betterssbExtension ?? null;
}

/** Resolves once the extension announces itself (it sets a marker on load). */
export function waitForExtension(
  timeoutMs = DETECT_TIMEOUT_MS,
): Promise<string | null> {
  return new Promise((resolve) => {
    const found = extensionVersion();
    if (found) return resolve(found);
    const started = Date.now();
    const timer = setInterval(() => {
      const version = extensionVersion();
      if (version || Date.now() - started >= timeoutMs) {
        clearInterval(timer);
        resolve(version);
      }
    }, DETECT_POLL_MS);
  });
}

/** Sends one request across the bridge and resolves with its data. */
export function bridgeRequest<T>(
  request: BridgeRequest,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const timer = setTimeout(() => {
      cleanup();
      reject(new ExtensionError("The BetterSSB extension didn't respond."));
    }, timeoutMs);

    function onMessage(event: MessageEvent) {
      if (event.source !== window || !isBridgeResponse(event.data, id)) return;
      cleanup();
      const { success, data, error } = event.data;
      if (success) resolve(data as T);
      else reject(new ExtensionError(error || "The extension request failed."));
    }
    function cleanup() {
      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
    }

    window.addEventListener("message", onMessage);
    const { type, ...payload } = request;
    window.postMessage(
      { source: BRIDGE_SOURCE, dir: "request", id, type, payload },
      window.location.origin,
    );
  });
}

/** Calls `listener` when the extension's store changes, in any tab or the popup. */
export function onExtensionStoreChange(
  listener: (key: StoreKey) => void,
): () => void {
  function onMessage(event: MessageEvent) {
    if (event.source === window && isBridgeEvent(event.data)) {
      listener(event.data.key);
    }
  }
  window.addEventListener("message", onMessage);
  return () => window.removeEventListener("message", onMessage);
}

/** Banner as the extension sees it. Without the extension, Banner can't be connected. */
export async function getBannerConnection(): Promise<BannerConnection> {
  if (!extensionVersion()) return "not-connected";
  return bridgeRequest<BannerConnection>({ type: "BANNER_STATUS" });
}

/** Asks the extension to run a fresh audit, then parses the result. */
export async function runViaExtension(): Promise<Audit> {
  const { html } = await bridgeRequest<{ html?: string }>(
    { type: "DARS_RUN_AUDIT" },
    AUDIT_TIMEOUT_MS,
  );
  if (!html) throw new ExtensionError("The audit failed.");
  return parseAuditHtml(html);
}
