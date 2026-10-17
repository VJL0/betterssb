import { describe, expect, it } from "vitest";
import { instructorSearchName, shortInstructorName } from "./instructors";

describe("instructorSearchName", () => {
  it.each([
    ["Pascucci, Christopher M.", "Christopher Pascucci"],
    ["Li, Cindy", "Cindy Li"],
    ["Rosen, Andrew B", "Andrew Rosen"],
    ["TBA", "TBA"],
    [" Whitlock ", "Whitlock"],
  ])("reads %j as %j", (banner, search) => {
    expect(instructorSearchName(banner)).toBe(search);
  });
});

describe("shortInstructorName", () => {
  it.each([
    ["Pascucci, Christopher M.", "C. Pascucci"],
    ["TBA", "TBA"],
  ])("shortens %j to %j", (banner, short) => {
    expect(shortInstructorName(banner)).toBe(short);
  });
});
