import { describe, expect, it } from "vitest";
import type { Requirement } from "@workspace/api-client";
import { formatCredits, isNoteOnly } from "./dars";

function requirement(overrides: Partial<Requirement>): Requirement {
  return {
    code: "RQ1",
    category: "Major",
    title: "",
    status: "none",
    notes: [],
    earned: null,
    inProgress: null,
    needs: null,
    subrequirements: [],
    ...overrides,
  };
}

describe("isNoteOnly", () => {
  it("treats an untitled requirement with no parts as a note", () => {
    expect(isNoteOnly(requirement({ notes: ["WARNING"] }))).toBe(true);
  });

  it("keeps titled requirements", () => {
    expect(isNoteOnly(requirement({ title: "Major core" }))).toBe(false);
  });
});

describe("formatCredits", () => {
  it.each([
    [null, ""],
    [undefined, ""],
    [4, "4"],
    [3.5, "3.5"],
    [2.25, "2.3"],
  ])("formats %s as %j", (input, expected) => {
    expect(formatCredits(input)).toBe(expected);
  });
});
