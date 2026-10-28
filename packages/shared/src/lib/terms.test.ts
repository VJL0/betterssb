import { describe, expect, it } from "vitest";
import {
  formatTermName,
  isViewOnlyTerm,
  nextTerms,
  splitTempleTerm,
  templeTermCode,
  templeTermCodeFromName,
} from "./terms";

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

describe("Temple term codes", () => {
  it("names codes", async () => {
    const { templeTermName } = await import("./terms");
    expect(templeTermName("202736")).toBe("Fall 2027");
    expect(templeTermName("202803")).toBe("Spring 2028");
    expect(templeTermName("202799")).toBeNull();
  });

  it("splits and builds codes", () => {
    expect(splitTempleTerm("202726")).toEqual({ year: 2027, season: "26" });
    expect(splitTempleTerm("202799")).toBeNull();
    expect(templeTermCode(2028, "03")).toBe("202803");
  });

  it("rolls over to the next year", () => {
    expect(nextTerms("202636", 2)).toEqual(["202703", "202720"]);
    expect(nextTerms("bad", 2)).toEqual([]);
  });
});

describe("templeTermCodeFromName", () => {
  it.each([
    ["2027 Spring", "202703"],
    ["2027 Summer I", "202720"],
    ["2027 Summer II", "202726"],
    ["2026 Fall (View Only)", "202636"],
    ["2027 Winter", null],
    ["Spring 2027", null],
  ])("reads %j as %j", (name, code) => {
    expect(templeTermCodeFromName(name)).toBe(code);
  });
});

describe("nextTerms", () => {
  it("includes both summer sessions", () => {
    expect(nextTerms("202703", 4)).toEqual([
      "202720",
      "202726",
      "202736",
      "202803",
    ]);
  });
});
