import { describe, expect, it } from "vitest";
import {
  classSection,
  meetingTime,
} from "@workspace/shared/testing/class-section";
import type { RatingLookup } from "@/hooks/use-ratings";
import {
  DEFAULT_FILTERS,
  activeFilterCount,
  groupByCourse,
  mostRestrictiveFilter,
  resetFilter,
  sectionPasses,
} from "./search-filters";
import type { RmpRating } from "@workspace/api-client";

const NO_RATINGS = new Map<string, RatingLookup>();

function rating(overallRating: number, difficulty = 3): RmpRating {
  return {
    professorName: "Dana Whitlock",
    department: "Computer Science",
    overallRating,
    difficulty,
    numRatings: 20,
    wouldTakeAgainPct: null,
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

  it("checks times, open seats and course levels", () => {
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
    // Banner returns 1000–3999 for these; the 2000s drop here.
    const skipping = {
      ...DEFAULT_FILTERS,
      levels: [1000 as const, 3000 as const],
    };
    expect(sectionPasses(onlineMath, skipping, NO_RATINGS)).toBe(true);
    expect(sectionPasses(tuesThurs, skipping, NO_RATINGS)).toBe(false);
  });

  it("leaves the filters Banner applied to Banner", () => {
    const genEd = { ...DEFAULT_FILTERS, attributes: ["GQ"], campus: "MN" };
    expect(sectionPasses(tuesThurs, genEd, NO_RATINGS)).toBe(true);
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
    const unrated = { ...rating(0), numRatings: 0 };
    expect(sectionPasses(tuesThurs, filters, new Map([[name, unrated]]))).toBe(
      false,
    );
  });
});

describe("maxDifficulty", () => {
  const name = "Whitlock, Dana";
  const filters = { ...DEFAULT_FILTERS, maxDifficulty: 2.5 as const };
  const passes = (lookup: RatingLookup) =>
    sectionPasses(tuesThurs, filters, new Map([[name, lookup]]));

  it("keeps instructors at or under the difficulty", () => {
    expect(passes(rating(4, 2.5))).toBe(true);
    expect(passes(rating(4, 2.6))).toBe(false);
  });

  it("keeps a section while its rating loads", () => {
    expect(sectionPasses(tuesThurs, filters, new Map())).toBe(true);
  });

  it("drops instructors with no profile or no ratings, whose 0.0 isn't easy", () => {
    expect(passes(null)).toBe(false);
    expect(passes({ ...rating(0, 0), numRatings: 0 })).toBe(false);
  });

  it("counts as a filter the empty state can name", () => {
    expect(activeFilterCount(filters)).toBe(1);
    expect(
      mostRestrictiveFilter(
        [tuesThurs],
        filters,
        new Map([[name, rating(4, 4.2)]]),
      ),
    ).toEqual({ filter: "maxDifficulty", recovered: 1 });
  });
});

describe("TBA instructors", () => {
  // Nobody to look up, so no rating ever arrives; it isn't "still loading".
  const tba = classSection({ courseReferenceNumber: "41300", faculty: [] });

  it("pass when no rating filter is on", () => {
    expect(sectionPasses(tba, DEFAULT_FILTERS, new Map())).toBe(true);
  });

  it("fail a rating minimum or a difficulty maximum", () => {
    expect(
      sectionPasses(tba, { ...DEFAULT_FILTERS, minRating: 3 }, new Map()),
    ).toBe(false);
    expect(
      sectionPasses(tba, { ...DEFAULT_FILTERS, maxDifficulty: 4 }, new Map()),
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

  it("counts Banner's filters as active", () => {
    expect(
      activeFilterCount({
        ...DEFAULT_FILTERS,
        formats: ["async"],
        instructor: "Hamid",
        campus: "MN",
      }),
    ).toBe(3);
    expect(activeFilterCount({ ...DEFAULT_FILTERS, instructor: "  " })).toBe(0);
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
