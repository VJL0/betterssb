import { describe, expect, it } from "vitest";
import { formatTermName, isViewOnlyTerm } from "./terms";

describe("formatTermName", () => {
  it.each([
    ["2027 Spring", "Spring 2027"],
    ["2026 Summer II", "Summer II 2026"],
    [" 2026 Fall ", "Fall 2026"],
    ["2025 Summer II (View Only)", "Summer II 2025"],
    ["Spring 2027", "Spring 2027"],
  ])("reads %j as %j", (banner, readable) => {
    expect(formatTermName(banner)).toBe(readable);
  });
});

describe("isViewOnlyTerm", () => {
  it("spots Banner's view-only marker", () => {
    expect(isViewOnlyTerm("2025 Fall (View Only)")).toBe(true);
    expect(isViewOnlyTerm("2027 Spring")).toBe(false);
  });
});
