import { describe, expect, it } from "vitest";
import {
  countsTowardGpa,
  gpaOf,
  gpaTotals,
  lowestGradeFor,
  neededAverage,
  type GpaCourse,
} from "./gpa";

function course(
  grade: string,
  credits: number,
  more: Partial<GpaCourse> = {},
): GpaCourse {
  return { grade, credits, category: "institution", repeat: null, ...more };
}

/** The graded rows of the Temple transcript fixture the API's parser tests read. */
const TEMPLE_TRANSCRIPT: GpaCourse[] = [
  course("NT", 4, { category: "transfer" }),
  course("TR", 4, { category: "transfer" }),
  course("TR", 4, { category: "transfer" }),
  course("A", 2),
  course("A", 1),
  course("A", 4),
  course("A-", 3),
  course("W", 4),
  course("A", 3),
  course("CR", 1),
  course("B+", 4),
  course("B", 4),
  course("B+", 4),
  course("A-", 4),
  course("A", 3),
  course("B", 4),
  course("A", 3),
  course("A-", 3),
  course("C", 4),
  course("B+", 4),
  course("A", 3),
  course("A-", 3),
  course("B-", 4),
  course("", 4, { category: "in_progress" }),
];

describe("gpaTotals", () => {
  it("adds up to the transcript's own institution totals", () => {
    const totals = gpaTotals(TEMPLE_TRANSCRIPT);
    expect(totals.hours).toBe(60);
    expect(totals.qualityPoints).toBeCloseTo(206.35, 2);
    expect(gpaOf(totals)?.toFixed(2)).toBe("3.44");
  });

  it("counts an in-progress course once it has an expected grade", () => {
    const expected = course("A", 4, { category: "in_progress" });
    expect(countsTowardGpa(expected)).toBe(true);
    expect(gpaTotals([...TEMPLE_TRANSCRIPT, expected]).hours).toBe(64);
  });

  it("leaves out transfer credit and attempts a repeat replaced", () => {
    expect(countsTowardGpa(course("A", 3, { category: "transfer" }))).toBe(
      false,
    );
    expect(countsTowardGpa(course("F", 3, { repeat: "E" }))).toBe(false);
    expect(countsTowardGpa(course("B", 3, { repeat: "I" }))).toBe(true);
  });

  it("has no GPA without graded hours", () => {
    expect(gpaOf(gpaTotals([course("W", 3)]))).toBeNull();
  });
});

describe("neededAverage", () => {
  it("finds the average that lands on the target", () => {
    const totals = { hours: 60, qualityPoints: 206.35 };
    const needed = neededAverage(totals, 18, 3.5);
    expect(needed).toBeCloseTo(3.7, 2);
    expect(lowestGradeFor(needed)).toBe("A");
  });

  it("picks the lowest grade worth at least the average", () => {
    expect(lowestGradeFor(3.33)).toBe("B+");
    expect(lowestGradeFor(3.34)).toBe("A-");
    expect(lowestGradeFor(-1)).toBe("F");
    expect(lowestGradeFor(4.2)).toBeNull();
  });
});
