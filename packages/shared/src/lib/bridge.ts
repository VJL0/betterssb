/**
 * The postMessage protocol between the BetterSSB website and the extension's
 * web-bridge content script. Only the requests listed here cross the bridge,
 * store requests must name a known store key, and a document being saved
 * must have that key's outline.
 */
import type { AutoRegQueue } from "../types/auto-reg";
import type { StoreDocument, StoreKey } from "../types/store";
import { isRecord } from "./guards";
import { isStoreDocument, isStoreKey } from "./store";

export const BRIDGE_SOURCE = "betterssb-bridge";

export type BridgeRequest =
  | { type: "DARS_RUN_AUDIT" }
  | { type: "BANNER_STATUS" }
  | { type: "STORE_KEYS" }
  | { type: "STORE_GET"; key: StoreKey }
  | { type: "STORE_DELETE"; key: StoreKey }
  | { type: "STORE_SET"; key: StoreKey; value: StoreDocument }
  | { type: "AUTOREG_GET" }
  | { type: "AUTOREG_SAVE_QUEUE"; queue: AutoRegQueue }
  | { type: "AUTOREG_ARM" }
  | { type: "AUTOREG_DISARM" }
  | { type: "AUTOREG_CHECK_CRNS"; term: string; crns: string[] }
  | { type: "AUTOREG_REGISTRATION_TIME"; term: string }
  | { type: "BANNER_REG_TERMS" }
  | { type: "BANNER_REG_PLANS" };

export interface BridgeResponse {
  source: typeof BRIDGE_SOURCE;
  dir: "response";
  id: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

export type BridgeEvent =
  | {
      source: typeof BRIDGE_SOURCE;
      dir: "event";
      type: "STORE_CHANGED";
      key: StoreKey;
    }
  | { source: typeof BRIDGE_SOURCE; dir: "event"; type: "AUTOREG_CHANGED" };

/** A queue can hold at most this many CRNs (Banner's add limit is far lower). */
export const MAX_QUEUED_CRNS = 30;
const CRN = /^\d{5}$/;
const TERM_CODE = /^\d{6}$/;
// `datetime-local`: 2026-11-14T07:00 or with seconds.
const LOCAL_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

function isCrnList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= MAX_QUEUED_CRNS &&
    value.every((crn) => typeof crn === "string" && CRN.test(crn)) &&
    new Set(value).size === value.length
  );
}

function isTermCode(value: unknown): value is string {
  return typeof value === "string" && TERM_CODE.test(value);
}

/** A queue the extension may save: a term, unique 5-digit CRNs, and a time. */
export function parseAutoRegQueue(value: unknown): AutoRegQueue | null {
  if (!isRecord(value)) return null;
  const v = value;
  if (!isTermCode(v.term) || !isCrnList(v.crns)) return null;
  if (
    typeof v.scheduledRunAt !== "string" ||
    (v.scheduledRunAt !== "" && !LOCAL_DATE_TIME.test(v.scheduledRunAt))
  ) {
    return null;
  }
  return { term: v.term, crns: v.crns, scheduledRunAt: v.scheduledRunAt };
}

type Envelope = Record<string, unknown>;

function isEnvelope(data: unknown, dir: string): data is Envelope {
  return isRecord(data) && data.source === BRIDGE_SOURCE && data.dir === dir;
}

/** The request in a page message, or null if it isn't an allowed bridge request. */
export function parseBridgeRequest(
  data: unknown,
): { id: string; request: BridgeRequest } | null {
  if (!isEnvelope(data, "request") || typeof data.id !== "string") return null;
  const { id, type } = data;
  const payload: Envelope = isRecord(data.payload) ? data.payload : {};
  switch (type) {
    case "DARS_RUN_AUDIT":
    case "BANNER_STATUS":
    case "STORE_KEYS":
    case "AUTOREG_GET":
    case "AUTOREG_ARM":
    case "AUTOREG_DISARM":
    case "BANNER_REG_TERMS":
    case "BANNER_REG_PLANS":
      return { id, request: { type } };
    case "AUTOREG_SAVE_QUEUE": {
      const queue = parseAutoRegQueue(payload.queue);
      return queue ? { id, request: { type, queue } } : null;
    }
    case "AUTOREG_CHECK_CRNS":
      return isTermCode(payload.term) && isCrnList(payload.crns)
        ? { id, request: { type, term: payload.term, crns: payload.crns } }
        : null;
    case "AUTOREG_REGISTRATION_TIME":
      return isTermCode(payload.term)
        ? { id, request: { type, term: payload.term } }
        : null;
    case "STORE_GET":
    case "STORE_DELETE":
      return isStoreKey(payload.key)
        ? { id, request: { type, key: payload.key } }
        : null;
    case "STORE_SET":
      return isStoreKey(payload.key) &&
        isStoreDocument(payload.key, payload.value)
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
  if (!isEnvelope(data, "event")) return false;
  if (data.type === "AUTOREG_CHANGED") return true;
  return data.type === "STORE_CHANGED" && isStoreKey(data.key);
}
