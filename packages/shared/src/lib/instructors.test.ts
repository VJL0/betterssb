import { describe, expect, it } from "vitest";
import {
  instructorSearchName,
  isSameInstructor,
  matchingProfile,
  shortInstructorName,
} from "./instructors";

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

describe("isSameInstructor", () => {
  it.each([
    ["Christopher M. Pascucci", "Christopher Pascucci"],
    ["Pascucci, Christopher M.", "Chris Pascucci"],
    ["José Núñez", "Jose Nunez"],
    ["Ana Smith-Jones", "Ana Smith"],
  ])("matches %j with %j", (banner, rmp) => {
    expect(isSameInstructor(banner, rmp)).toBe(true);
  });

  it.each([
    ["Cindy Li", "Cindy Liao"],
    ["Benjamin R. Bray", "Benjamin Krakauer"],
    ["Hamid R. Shahbazkia", "Nahed Hamid"],
    ["Daniel Yee", "David Yee"],
    ["TBA", "Tba Smith"],
  ])("doesn't match %j with %j", (banner, rmp) => {
    expect(isSameInstructor(banner, rmp)).toBe(false);
  });
});

describe("matchingProfile", () => {
  it("skips loose search results for the right person", () => {
    const results = [
      { professorName: "Cindy Liao" },
      { professorName: "Cindy Li" },
    ];
    expect(matchingProfile("Li, Cindy", results)).toBe(results[1]);
  });

  it("is null when nobody matches", () => {
    expect(
      matchingProfile("Cindy Li", [{ professorName: "Cindy Liao" }]),
    ).toBeNull();
  });
});
