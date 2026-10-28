import { describe, expect, it } from "vitest";
import {
  classSection,
  meetingTime,
} from "@workspace/shared/testing/class-section";
import type { RatingLookup } from "@/hooks/use-ratings";
import type { RmpRating } from "@workspace/api-client";
import { groupByCourse } from "./search-filters";
import { sortGroups, type SortKey } from "./sort-results";

function profile(name: string, overallRating: number, difficulty: number) {
  return {
    professorName: name,
    department: "",
    overallRating,
    difficulty,
    numRatings: overallRating ? 10 : 0,
    wouldTakeAgainPct: null,
    topTags: [],
    rmpUrl: "",
  } satisfies RmpRating;
}

function section(
  crn: string,
  course: string,
  instructor: string | null,
  start: string | null,
  seats: number,
) {
  return classSection({
    courseReferenceNumber: crn,
    courseNumber: course,
    subjectCourse: `CIS${course}`,
    seatsAvailable: seats,
    faculty: instructor
      ? [
          {
            bannerId: crn,
            displayName: instructor,
            emailAddress: null,
            primaryIndicator: true,
          },
        ]
      : [],
    meetings: [meetingTime("MW", start, start ? "1250" : null)],
  });
}

// CIS 1068: an 8 AM section by Hart, a 10 AM one by Lee, a TBA one online.
// CIS 2168: one 9 AM section by Moss with lots of seats.
const SECTIONS = [
  section("1", "1068", "Hart, Ann", "0800", 2),
  section("2", "1068", "Lee, Bo", "1000", 5),
  section("3", "1068", null, null, 9),
  section("4", "2168", "Moss, Cy", "0900", 30),
];
const RATINGS = new Map<string, RatingLookup>([
  ["Hart, Ann", profile("Ann Hart", 3.1, 4.5)],
  ["Lee, Bo", profile("Bo Lee", 4.6, 2.2)],
  ["Moss, Cy", profile("Cy Moss", 0, 0)],
]);

function order(sort: SortKey) {
  return sortGroups(groupByCourse(SECTIONS), sort, RATINGS).map((g) =>
    g.sections.map((s) => s.courseReferenceNumber).join(""),
  );
}

describe("sortGroups", () => {
  it("keeps Banner's order by course", () => {
    expect(order("course")).toEqual(["123", "4"]);
  });

  it("puts the best rated first, with unrated and TBA last", () => {
    // Moss has a profile nobody rated, so CIS 2168 has no rated section.
    expect(order("rating")).toEqual(["213", "4"]);
  });

  it("puts the easiest first", () => {
    expect(order("difficulty")).toEqual(["213", "4"]);
  });

  it("orders by earliest start, sections with no set time last", () => {
    expect(order("start")).toEqual(["123", "4"]);
  });

  it("orders courses by their earliest section", () => {
    const later = SECTIONS.filter((s) => s.courseReferenceNumber !== "1");
    const groups = sortGroups(groupByCourse(later), "start", RATINGS);
    expect(groups.map((g) => g.courseId)).toEqual(["CIS2168", "CIS1068"]);
  });

  it("orders by most open seats", () => {
    expect(order("seats")).toEqual(["4", "321"]);
  });
});
