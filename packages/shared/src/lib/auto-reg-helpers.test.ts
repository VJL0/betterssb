import { describe, expect, it } from "vitest";
import type { SSBRegPlanHeader, SSBTerm } from "../types/ssb";
import {
  crnsFromPlanHeader,
  mergeTermsFromPlans,
  normalizeCrnList,
  parseAutoRegBatchResultJson,
  parseManualCrns,
  resolvePlanIdToValid,
  resolveTermCodeToValid,
} from "./auto-reg-helpers";

const SPRING: SSBTerm = { code: "202703", description: "2027 Spring" };
const FALL: SSBTerm = { code: "202636", description: "2026 Fall" };

function plan(id: number, term: string, crns: string[] = []): SSBRegPlanHeader {
  return {
    id,
    term,
    description: `Plan ${id}`,
    planCourses: crns.map((courseReferenceNumber) => ({
      courseReferenceNumber,
    })),
  } as SSBRegPlanHeader;
}

describe("parseManualCrns", () => {
  it("splits on commas and whitespace and drops blanks", () => {
    expect(parseManualCrns(" 41207, 41311\n52018  ,,")).toEqual([
      "41207",
      "41311",
      "52018",
    ]);
  });
});

describe("normalizeCrnList", () => {
  it("compares lists regardless of order and separators", () => {
    expect(normalizeCrnList("2, 1 3")).toBe(normalizeCrnList("3,2,1"));
  });
});

describe("mergeTermsFromPlans", () => {
  it("adds terms that only appear on plans, sorted by code", () => {
    const merged = mergeTermsFromPlans([SPRING], [plan(1, "202636")]);
    expect(merged.map((t) => t.code)).toEqual(["202636", "202703"]);
  });
});

describe("crnsFromPlanHeader", () => {
  it("returns no CRNs for a missing plan", () => {
    expect(crnsFromPlanHeader(null)).toEqual([]);
  });

  it("reads trimmed CRNs from plan courses", () => {
    expect(crnsFromPlanHeader(plan(1, "202703", [" 41207 ", ""]))).toEqual([
      "41207",
    ]);
  });
});

describe("resolveTermCodeToValid", () => {
  it("keeps a stored term that still exists", () => {
    expect(resolveTermCodeToValid("202636", [SPRING, FALL])).toBe("202636");
  });

  it("falls back to the first term", () => {
    expect(resolveTermCodeToValid("199901", [SPRING, FALL])).toBe("202703");
  });
});

describe("resolvePlanIdToValid", () => {
  it("is empty when the term has no plans", () => {
    expect(resolvePlanIdToValid("3", [])).toBe("");
  });

  it("falls back to the first plan when the stored id is gone", () => {
    expect(resolvePlanIdToValid("9", [plan(4, "202703")])).toBe("4");
  });
});

describe("parseAutoRegBatchResultJson", () => {
  it("returns null for blank or invalid JSON", () => {
    expect(parseAutoRegBatchResultJson("  ")).toBeNull();
    expect(parseAutoRegBatchResultJson("{nope")).toBeNull();
  });
});
