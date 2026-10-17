import { describe, expect, it } from "vitest";
import { assignCourseColorOrder, courseColor } from "./course-colors";

describe("courseColor", () => {
  it("maps cart order to slots 1 to 8", () => {
    expect(courseColor(0)).toEqual({ slot: 1, hatched: false });
    expect(courseColor(7)).toEqual({ slot: 8, hatched: false });
  });

  it("reuses colors with a hatch after the eighth course", () => {
    expect(courseColor(8)).toEqual({ slot: 1, hatched: true });
    expect(courseColor(10)).toEqual({ slot: 3, hatched: true });
  });
});

describe("assignCourseColorOrder", () => {
  it("assigns in cart order", () => {
    expect(assignCourseColorOrder(["CIS2168", "MATH2101"])).toEqual({
      CIS2168: 0,
      MATH2101: 1,
    });
  });

  it("keeps saved colors when a course is removed or added", () => {
    const saved = { CIS2168: 0, CIS2107: 1, MATH2101: 2 };
    expect(
      assignCourseColorOrder(["CIS2168", "MATH2101", "CIS2033"], saved),
    ).toEqual({ CIS2168: 0, MATH2101: 2, CIS2033: 1 });
  });

  it("drops a duplicate saved order instead of sharing a color", () => {
    expect(assignCourseColorOrder(["A", "B"], { A: 0, B: 0 })).toEqual({
      A: 0,
      B: 1,
    });
  });
});
