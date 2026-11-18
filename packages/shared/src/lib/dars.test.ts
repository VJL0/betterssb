import { describe, expect, it } from "vitest";
import type { Requirement } from "@workspace/api-client";
import { creditsLabel, formatCredits, isNoteOnly } from "./dars";

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
    requiredCredits: null,
    requiredGpa: null,
    requiredSubrequirements: null,
    requiredCount: null,
    maxCredits: null,
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

describe("creditsLabel", () => {
  it("says credit for one and credits otherwise", () => {
    expect(creditsLabel(1)).toBe("1 credit");
    expect(creditsLabel(3)).toBe("3 credits");
    expect(creditsLabel(1.5)).toBe("1.5 credits");
    expect(creditsLabel(0)).toBe("0 credits");
  });

  it("passes text credits through", () => {
    expect(creditsLabel("1")).toBe("1 credit");
    expect(creditsLabel("1-4")).toBe("1-4 credits");
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
