import {
  BRIDGE_SOURCE,
  parseBridgeRequest,
} from "@workspace/shared/lib/bridge";
import type { BannerConnection, StoreKey } from "@workspace/shared/types/store";

/**
 * Stands in for the extension's web-bridge content script: answers bridge
 * requests from an in-memory store, using the same allowlist.
 *
 * Replies are dispatched with `source: window`, as a browser's postMessage
 * does; jsdom's postMessage leaves `source` null.
 */
export function installFakeBridge({
  banner = "connected" as BannerConnection,
  documents = {} as Partial<Record<StoreKey, unknown>>,
} = {}) {
  const data = new Map(Object.entries(documents)) as Map<StoreKey, unknown>;
  const origin = window.location.origin;
  document.documentElement.dataset.betterssbExtension = "9.9.9";

  function post(data: Record<string, unknown>) {
    window.dispatchEvent(
      new MessageEvent("message", { data, origin, source: window }),
    );
  }

  function reply(id: string, body: Record<string, unknown>) {
    post({ source: BRIDGE_SOURCE, dir: "response", id, ...body });
  }

  function emitChange(key: StoreKey) {
    post({ source: BRIDGE_SOURCE, dir: "event", type: "STORE_CHANGED", key });
  }

  function onMessage(event: MessageEvent) {
    const d = event.data as { dir?: string; id?: unknown } | null;
    if (d?.dir !== "request" || typeof d.id !== "string") return;
    const parsed = parseBridgeRequest(event.data);
    if (!parsed)
      return reply(d.id, {
        success: false,
        error: "That request isn't allowed.",
      });
    const { id, request } = parsed;
    switch (request.type) {
      case "BANNER_STATUS":
        return reply(id, { success: true, data: banner });
      case "STORE_KEYS":
        return reply(id, { success: true, data: [...data.keys()] });
      case "STORE_GET":
        return reply(id, {
          success: true,
          data: data.get(request.key) ?? null,
        });
      case "STORE_SET":
        data.set(request.key, request.value);
        reply(id, { success: true });
        return emitChange(request.key);
      case "STORE_DELETE":
        data.delete(request.key);
        reply(id, { success: true });
        return emitChange(request.key);
      case "DARS_RUN_AUDIT":
        return reply(id, { success: false, error: "No DARS in tests." });
    }
  }

  window.addEventListener("message", onMessage);
  return {
    data,
    emitChange,
    uninstall() {
      window.removeEventListener("message", onMessage);
      delete document.documentElement.dataset.betterssbExtension;
    },
  };
}
