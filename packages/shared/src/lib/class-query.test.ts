import { describe, expect, it } from "vitest";
import { parseClassQuery } from "./class-query";

const SUBJECTS = new Set(["CIS", "MATH", "ART"]);

describe("parseClassQuery", () => {
  it.each([
    ["CIS 2168", { kind: "course", subject: "CIS", courseNumber: "2168" }],
    ["cis2168", { kind: "course", subject: "CIS", courseNumber: "2168" }],
    ["MATH-1041", { kind: "course", subject: "MATH", courseNumber: "1041" }],
    ["math", { kind: "subject", subject: "MATH" }],
    ["data", { kind: "keyword", keyword: "data" }],
    ["linear   algebra", { kind: "keyword", keyword: "linear algebra" }],
    ["XYZ 1000", { kind: "keyword", keyword: "XYZ 1000" }],
    ["41207", { kind: "crn", crn: "41207" }],
    [" a ", { kind: "empty" }],
  ])("reads %j", (input, expected) => {
    expect(parseClassQuery(input, SUBJECTS)).toEqual(expected);
  });
});
