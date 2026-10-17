import { describe, expect, it } from "vitest";
import type { RMPRating } from "@workspace/shared/types";
import { classSection, meetingTime } from "@/test/class-section";
import type { RatingLookup } from "@/hooks/use-ratings";
import {
  DEFAULT_FILTERS,
  activeFilterCount,
  groupByCourse,
  mostRestrictiveFilter,
  resetFilter,
  sectionPasses,
} from "./search-filters";

const NO_RATINGS = new Map<string, RatingLookup>();

function rating(overallRating: number): RMPRating {
  return {
    professorName: "Dana Whitlock",
    department: "Computer Science",
    overallRating,
    difficulty: 3,
    numRatings: 20,
    topTags: [],
    rmpUrl: "",
  };
}

const tuesThurs = classSection();
const mwf = classSection({
  courseReferenceNumber: "41208",
  meetings: [meetingTime("MWF", "1100", "1150")],
  seatsAvailable: 0,
});
const onlineMath = classSection({
  subject: "MATH",
  courseNumber: "1041",
  courseReferenceNumber: "52001",
  meetings: [meetingTime("", null, null)],
  sectionAttributes: [{ code: "GQ", description: "GenEd Quantitative" }],
});

describe("sectionPasses", () => {
  it("keeps everything with the default filters", () => {
    for (const s of [tuesThurs, mwf, onlineMath]) {
      expect(sectionPasses(s, DEFAULT_FILTERS, NO_RATINGS)).toBe(true);
    }
  });

  it("drops sections that meet on a day turned off", () => {
    const filters = { ...DEFAULT_FILTERS, days: ["T" as const, "R" as const] };
    expect(sectionPasses(tuesThurs, filters, NO_RATINGS)).toBe(true);
    expect(sectionPasses(mwf, filters, NO_RATINGS)).toBe(false);
    // An online section meets on no day, so no day rules it out.
    expect(sectionPasses(onlineMath, filters, NO_RATINGS)).toBe(true);
  });

  it("checks times, open seats and attributes", () => {
    expect(
      sectionPasses(
        tuesThurs,
        { ...DEFAULT_FILTERS, startAfter: 600 },
        NO_RATINGS,
      ),
    ).toBe(false);
    expect(
      sectionPasses(mwf, { ...DEFAULT_FILTERS, openOnly: true }, NO_RATINGS),
    ).toBe(false);
    const genEd = { ...DEFAULT_FILTERS, attributes: ["GQ"] };
    expect(sectionPasses(onlineMath, genEd, NO_RATINGS)).toBe(true);
    expect(sectionPasses(tuesThurs, genEd, NO_RATINGS)).toBe(false);
  });

  it("keeps a section while its rating loads, and drops one with no profile", () => {
    const filters = { ...DEFAULT_FILTERS, minRating: 4 as const };
    const name = "Whitlock, Dana";
    expect(sectionPasses(tuesThurs, filters, new Map())).toBe(true);
    expect(sectionPasses(tuesThurs, filters, new Map([[name, null]]))).toBe(
      false,
    );
    expect(
      sectionPasses(tuesThurs, filters, new Map([[name, rating(4.4)]])),
    ).toBe(true);
    expect(
      sectionPasses(tuesThurs, filters, new Map([[name, rating(3.2)]])),
    ).toBe(false);
  });
});

describe("mostRestrictiveFilter", () => {
  it("names the filter whose reset brings back the most sections", () => {
    const filters = {
      ...DEFAULT_FILTERS,
      days: ["T" as const, "R" as const],
      openOnly: true,
      startAfter: 660,
    };
    const sections = [tuesThurs, mwf];
    expect(sections.some((s) => sectionPasses(s, filters, NO_RATINGS))).toBe(
      false,
    );
    expect(mostRestrictiveFilter(sections, filters, NO_RATINGS)).toEqual({
      filter: "times",
      recovered: 1,
    });
    expect(activeFilterCount(filters)).toBe(3);
    expect(activeFilterCount(resetFilter(filters, "times"))).toBe(2);
  });
});

describe("groupByCourse", () => {
  it("groups sections by course in Banner's order", () => {
    expect(
      groupByCourse([tuesThurs, onlineMath, mwf]).map((g) => [
        g.courseId,
        g.sections.length,
      ]),
    ).toEqual([
      ["CIS2168", 2],
      ["MATH1041", 1],
    ]);
  });
});
