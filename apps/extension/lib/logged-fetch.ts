import {
  addRequest,
  loggableUrl,
  type LoggedRequest,
} from "@workspace/shared/lib/request-log";
import { extensionStore } from "./local-store";

let pendingWrite: Promise<void> = Promise.resolve();

/**
 * Adds one request to the log the popup shows. Writes run one after another,
 * so two requests finishing together can't drop each other's entry.
 */
function logRequest(request: LoggedRequest): void {
  pendingWrite = pendingWrite
    .then(async () => {
      const log = await extensionStore.get("requestLog");
      await extensionStore.set(
        "requestLog",
        addRequest(log, request, new Date().toISOString()),
      );
    })
    // A failed write loses one entry; it never fails the request or the next entry.
    .catch(() => undefined);
}

function requestUrl(input: RequestInfo | URL): string {
  if (input instanceof Request) return input.url;
  return new URL(input, globalThis.location?.href).href;
}

function requestMethod(input: RequestInfo | URL, init: RequestInit): string {
  const method =
    init.method ?? (input instanceof Request ? input.method : "GET");
  return method.toUpperCase();
}

/**
 * `fetch` for every request the extension sends (Banner, TUportal, DARS and
 * the BetterSSB API), logged by method, URL and status so the popup can list
 * them all. Bodies and headers are never logged. The log is written in the
 * background so a timed registration submit isn't held up by it.
 */
export async function loggedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const method = requestMethod(input, init);
  const url = loggableUrl(requestUrl(input));
  try {
    const res = await fetch(input, init);
    logRequest({ method, url, status: res.status });
    return res;
  } catch (err) {
    logRequest({ method, url, status: null });
    throw err;
  }
}
