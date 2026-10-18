import { describe, expect, it } from "vitest";
import {
  armProblem,
  countdown,
  crnLookupResult,
  moveCrn,
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
    [{ ...queue, scheduledRunAt: "" }, "Set when to submit."],
    [
      { ...queue, scheduledRunAt: "2026-10-01T07:00" },
      "The submit time has passed. Pick a time ahead.",
    ],
  ])("explains what's missing", (q, problem) => {
    expect(armProblem(q, NOW)).toBe(problem);
  });
});

describe("crnLookupResult", () => {
  it("reads found and not found", () => {
    expect(
      crnLookupResult("41207", {
        success: true,
        data: { success: true, model: { courseReferenceNumber: "41207" } },
      }),
    ).toBe(true);
    expect(
      crnLookupResult("41207", {
        success: true,
        data: { courseReferenceNumber: 41207 },
      }),
    ).toBe(true);
    expect(
      crnLookupResult("41207", { success: true, data: { success: false } }),
    ).toBe(false);
  });

  it("is null when Banner couldn't be asked or the answer is unreadable", () => {
    expect(
      crnLookupResult("41207", { success: false, error: "No SSB tab" }),
    ).toBeNull();
    expect(crnLookupResult("41207", { success: true, data: "<html>" })).toBe(
      null,
    );
    expect(crnLookupResult("41207", { success: true, data: {} })).toBeNull();
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

describe("moveCrn", () => {
  it("moves within bounds only", () => {
    expect(moveCrn(["a", "b", "c"], 2, -1)).toEqual(["a", "c", "b"]);
    expect(moveCrn(["a", "b"], 0, -1)).toEqual(["a", "b"]);
  });
});
