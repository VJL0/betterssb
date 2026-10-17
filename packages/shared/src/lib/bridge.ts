/**
 * The postMessage protocol between the BetterSSB website and the extension's
 * web-bridge content script. Only the requests listed here cross the bridge,
 * and store requests must name a known store key.
 */
import type { StoreKey } from "../types/store";
import { isStoreKey } from "./store";

export const BRIDGE_SOURCE = "betterssb-bridge";

export type BridgeRequest =
  | { type: "DARS_RUN_AUDIT" }
  | { type: "BANNER_STATUS" }
  | { type: "STORE_KEYS" }
  | { type: "STORE_GET"; key: StoreKey }
  | { type: "STORE_DELETE"; key: StoreKey }
  | { type: "STORE_SET"; key: StoreKey; value: unknown };

export type BridgeRequestType = BridgeRequest["type"];

export interface BridgeResponse {
  source: typeof BRIDGE_SOURCE;
  dir: "response";
  id: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface BridgeEvent {
  source: typeof BRIDGE_SOURCE;
  dir: "event";
  type: "STORE_CHANGED";
  key: StoreKey;
}

type Envelope = Record<string, unknown>;

function isEnvelope(data: unknown, dir: string): data is Envelope {
  const d = data as Envelope | null;
  return (
    typeof d === "object" &&
    d !== null &&
    d.source === BRIDGE_SOURCE &&
    d.dir === dir
  );
}

/** The request in a page message, or null if it isn't an allowed bridge request. */
export function parseBridgeRequest(
  data: unknown,
): { id: string; request: BridgeRequest } | null {
  if (!isEnvelope(data, "request") || typeof data.id !== "string") return null;
  const { id, type } = data;
  const payload = (data.payload ?? {}) as Envelope;
  switch (type) {
    case "DARS_RUN_AUDIT":
    case "BANNER_STATUS":
    case "STORE_KEYS":
      return { id, request: { type } };
    case "STORE_GET":
    case "STORE_DELETE":
      return isStoreKey(payload.key)
        ? { id, request: { type, key: payload.key } }
        : null;
    case "STORE_SET":
      return isStoreKey(payload.key) && "value" in payload
        ? { id, request: { type, key: payload.key, value: payload.value } }
        : null;
    default:
      return null;
  }
}

export function isBridgeResponse(
  data: unknown,
  id: string,
): data is BridgeResponse {
  return isEnvelope(data, "response") && data.id === id;
}

export function isBridgeEvent(data: unknown): data is BridgeEvent {
  return (
    isEnvelope(data, "event") &&
    data.type === "STORE_CHANGED" &&
    isStoreKey(data.key)
  );
}
