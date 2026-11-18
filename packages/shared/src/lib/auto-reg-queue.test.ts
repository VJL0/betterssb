import { describe, expect, it } from "vitest";
import {
  armProblem,
  countdown,
  crnLookupResult,
  isAutoRegSnapshot,
} from "./auto-reg-queue";

const NOW = new Date("2026-10-17T12:00:00").getTime();
const queue = {
  term: "202703",
  crns: ["41207"],
  scheduledRunAt: "2026-11-14T07:00",
};

describe("armProblem", () => {
  it("allows a complete queue with a time ahead", () => {
    expect(armProblem(queue, NOW)).toBeNull();
  });

  it.each([
    [{ ...queue, term: "" }, "Choose a term."],
    [{ ...queue, crns: [] }, "Add at least one CRN."],
    [{ ...queue, scheduledRunAt: "" }, "Set your registration time."],
    [
      { ...queue, scheduledRunAt: "2026-10-01T07:00" },
      "That time has passed. Pick a later one.",
    ],
  ])("explains what's missing", (q, problem) => {
    expect(armProblem(q, NOW)).toBe(problem);
  });
});

describe("crnLookupResult", () => {
  it("reads found and not found", () => {
    // Banner's answer for CRN 31752 (data/ssb/Register for classes Fall 2026.har).
    expect(
      crnLookupResult({
        subject: "CIS",
        courseTitle: "Foundations of Machine Learning",
        sequenceNumber: "001",
        courseNumber: "4526",
        responseDisplay: "Foundations of Machine Learning CIS 4526, 001",
        olr: false,
        projectionError: false,
        success: true,
      }),
    ).toBe(true);
    expect(crnLookupResult({ success: false })).toBe(false);
  });

  it("is null when the answer is unreadable", () => {
    expect(crnLookupResult("<html>")).toBeNull();
    expect(crnLookupResult({})).toBeNull();
    expect(crnLookupResult({ success: true })).toBeNull();
  });
});

describe("countdown", () => {
  it("counts down in days, hours, minutes and seconds", () => {
    const target = NOW + ((28 * 24 + 14) * 3600 + 6 * 60 + 12) * 1000;
    expect(countdown(target, NOW)).toBe("28d 14h 06m 12s");
    expect(countdown(NOW + 65_000, NOW)).toBe("0h 01m 05s");
    expect(countdown(NOW, NOW)).toBeNull();
  });
});

describe("isAutoRegSnapshot", () => {
  const snapshot = {
    term: "202703",
    crns: ["41207"],
    scheduledRunAt: "2026-11-14T07:00",
    armed: false,
    lastResult: null,
  };

  it("accepts the extension's snapshot", () => {
    expect(isAutoRegSnapshot(snapshot)).toBe(true);
  });

  it("rejects a snapshot with the wrong field types", () => {
    expect(isAutoRegSnapshot({ ...snapshot, crns: "41207" })).toBe(false);
    expect(isAutoRegSnapshot({ ...snapshot, armed: "yes" })).toBe(false);
    expect(isAutoRegSnapshot({ ...snapshot, lastResult: {} })).toBe(false);
  });
});
