import { describe, expect, it } from "vitest";
import {
  BRIDGE_SOURCE,
  isBridgeEvent,
  isBridgeResponse,
  parseBridgeRequest,
} from "./bridge";

function request(type: string, payload?: unknown) {
  return { source: BRIDGE_SOURCE, dir: "request", id: "r1", type, payload };
}

describe("parseBridgeRequest", () => {
  it("accepts the allowed requests", () => {
    expect(parseBridgeRequest(request("DARS_RUN_AUDIT"))).toEqual({
      id: "r1",
      request: { type: "DARS_RUN_AUDIT" },
    });
    expect(
      parseBridgeRequest(request("STORE_GET", { key: "plan:202703" })),
    ).toEqual({ id: "r1", request: { type: "STORE_GET", key: "plan:202703" } });
    expect(
      parseBridgeRequest(
        request("STORE_SET", { key: "settings", value: { term: "202703" } }),
      )?.request,
    ).toEqual({
      type: "STORE_SET",
      key: "settings",
      value: { term: "202703" },
    });
  });

  it("accepts a well-formed auto-register queue", () => {
    const queue = {
      term: "202703",
      crns: ["41207", "41311"],
      scheduledRunAt: "2026-11-14T07:00",
    };
    expect(
      parseBridgeRequest(request("AUTOREG_SAVE_QUEUE", { queue }))?.request,
    ).toEqual({ type: "AUTOREG_SAVE_QUEUE", queue });
    expect(
      parseBridgeRequest(
        request("AUTOREG_CHECK_CRNS", { term: "202703", crns: ["41207"] }),
      )?.request,
    ).toEqual({ type: "AUTOREG_CHECK_CRNS", term: "202703", crns: ["41207"] });
    expect(
      parseBridgeRequest(
        request("AUTOREG_REGISTRATION_TIME", { term: "202703" }),
      )?.request,
    ).toEqual({ type: "AUTOREG_REGISTRATION_TIME", term: "202703" });
  });

  it.each([
    ["an unknown type", request("SSB_REG_SUBMIT_BATCH")],
    [
      "a queue with a bad CRN",
      request("AUTOREG_SAVE_QUEUE", {
        queue: { term: "202703", crns: ["4120"], scheduledRunAt: "" },
      }),
    ],
    [
      "a queue with a repeated CRN",
      request("AUTOREG_SAVE_QUEUE", {
        queue: {
          term: "202703",
          crns: ["41207", "41207"],
          scheduledRunAt: "",
        },
      }),
    ],
    [
      "a queue with a bad time",
      request("AUTOREG_SAVE_QUEUE", {
        queue: { term: "202703", crns: ["41207"], scheduledRunAt: "soon" },
      }),
    ],
    [
      "a CRN check without a term",
      request("AUTOREG_CHECK_CRNS", { crns: ["41207"] }),
    ],
    [
      "a registration time lookup with a bad term",
      request("AUTOREG_REGISTRATION_TIME", { term: "Spring 2027" }),
    ],
    [
      "an unknown key",
      request("STORE_GET", { key: "betterssb:autoRegRunState" }),
    ],
    ["a malformed plan key", request("STORE_GET", { key: "plan:../x" })],
    ["a set without a value", request("STORE_SET", { key: "settings" })],
    ["another source", { ...request("BANNER_STATUS"), source: "evil" }],
    ["a response", { ...request("BANNER_STATUS"), dir: "response" }],
    ["a missing id", { ...request("BANNER_STATUS"), id: 5 }],
    ["null", null],
  ])("rejects %s", (_name, data) => {
    expect(parseBridgeRequest(data)).toBeNull();
  });
});

describe("isBridgeResponse", () => {
  it("matches only the awaited id", () => {
    const res = {
      source: BRIDGE_SOURCE,
      dir: "response",
      id: "a",
      success: true,
    };
    expect(isBridgeResponse(res, "a")).toBe(true);
    expect(isBridgeResponse(res, "b")).toBe(false);
  });
});

describe("isBridgeEvent", () => {
  it("recognizes store changes for known keys", () => {
    const event = {
      source: BRIDGE_SOURCE,
      dir: "event",
      type: "STORE_CHANGED",
    };
    expect(isBridgeEvent({ ...event, key: "audit" })).toBe(true);
    expect(isBridgeEvent({ ...event, key: "nope" })).toBe(false);
    expect(isBridgeEvent({ ...event, type: "AUTOREG_CHANGED" })).toBe(true);
  });
});
