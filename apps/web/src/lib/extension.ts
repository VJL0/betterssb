/**
 * Talks to the BetterSSB browser extension, when it's installed.
 *
 * The extension's web-bridge content script answers `window.postMessage`
 * requests on this origin (see @workspace/shared/lib/bridge). Through it the
 * site runs DARS audits in the student's own session, reads the Banner
 * connection, shares the extension's local store, and sets up and arms
 * auto-register (the extension runs it, in the student's Banner tab). No credential ever
 * reaches this site or the server.
 */
import {
  BRIDGE_SOURCE,
  isBridgeEvent,
  isBridgeResponse,
  type BridgeRequest,
} from "@workspace/shared/lib/bridge";
import type {
  AutoRegQueue,
  AutoRegSnapshot,
  CrnCheck,
  RegistrationTimeLookup,
} from "@workspace/shared/types/auto-reg";
import type { SSBGetPlansResponse, SSBTerm } from "@workspace/shared/types/ssb";
import type { BannerConnection, StoreKey } from "@workspace/shared/types/store";
import { parseAudit, type Audit } from "@workspace/api-client";

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

/**
 * Resolves once the extension announces itself (it sets a marker on load), or
 * with null after a short wait or when `signal` aborts.
 */
export function waitForExtension(signal?: AbortSignal): Promise<string | null> {
  return new Promise((resolve) => {
    const found = extensionVersion();
    if (found || signal?.aborted) return resolve(found);
    const started = Date.now();
    const timer = setInterval(() => {
      const version = extensionVersion();
      if (version || Date.now() - started >= DETECT_TIMEOUT_MS) finish(version);
    }, DETECT_POLL_MS);
    signal?.addEventListener("abort", () => finish(null), { once: true });

    function finish(version: string | null) {
      clearInterval(timer);
      resolve(version);
    }
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
    const data: unknown = event.data;
    if (
      event.source === window &&
      isBridgeEvent(data) &&
      data.type === "STORE_CHANGED"
    ) {
      listener(data.key);
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
  const { data } = await parseAudit({
    body: html,
    meta: { errorMessage: "Couldn't read the audit." },
  });
  return data;
}

/** Auto-register's queue, armed flag and last result, as the extension has them. */
export function getAutoRegister(): Promise<AutoRegSnapshot> {
  return bridgeRequest<AutoRegSnapshot>({ type: "AUTOREG_GET" });
}

/** Replaces the queue. The extension refuses while armed. */
export async function saveAutoRegisterQueue(
  queue: AutoRegQueue,
): Promise<void> {
  await bridgeRequest({ type: "AUTOREG_SAVE_QUEUE", queue });
}

/** Arms the one-shot run; the extension checks the queue and time first. */
export async function armAutoRegister(): Promise<void> {
  await bridgeRequest({ type: "AUTOREG_ARM" });
}

export async function disarmAutoRegister(): Promise<void> {
  await bridgeRequest({ type: "AUTOREG_DISARM" });
}

/** Banner's CRN lookups take a moment each; give the whole queue time. */
const CRN_CHECK_TIMEOUT_MS = 30_000;

/** Asks the student's Banner tab whether each CRN exists in the term. */
export function checkCrns(term: string, crns: string[]): Promise<CrnCheck[]> {
  return bridgeRequest<CrnCheck[]>(
    { type: "AUTOREG_CHECK_CRNS", term, crns },
    CRN_CHECK_TIMEOUT_MS,
  );
}

// The extension asks TUportal over the network, which can take a few seconds.
const REGISTRATION_TIME_TIMEOUT_MS = 15_000;

/** The student's registration time for `term`, from TUportal's priority registration countdown. */
export function getRegistrationTime(
  term: string,
): Promise<RegistrationTimeLookup> {
  return bridgeRequest<RegistrationTimeLookup>(
    { type: "AUTOREG_REGISTRATION_TIME", term },
    REGISTRATION_TIME_TIMEOUT_MS,
  );
}

/** Terms open for registration, from the student's Banner tab. */
export function getBannerRegistrationTerms(): Promise<SSBTerm[]> {
  return bridgeRequest<SSBTerm[]>({ type: "BANNER_REG_TERMS" });
}

/** The student's saved Banner plans. */
export function getBannerPlans(): Promise<SSBGetPlansResponse> {
  return bridgeRequest<SSBGetPlansResponse>({ type: "BANNER_REG_PLANS" });
}

/** Calls `listener` when auto-register changes in the extension (armed, ran, edited). */
export function onAutoRegisterChange(listener: () => void): () => void {
  function onMessage(event: MessageEvent) {
    const data: unknown = event.data;
    if (
      event.source === window &&
      isBridgeEvent(data) &&
      data.type === "AUTOREG_CHANGED"
    ) {
      listener();
    }
  }
  window.addEventListener("message", onMessage);
  return () => window.removeEventListener("message", onMessage);
}
