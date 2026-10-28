import { describe, expect, it } from "vitest";
import {
  appliedFilters,
  quickFilterBase,
  removeFilter,
  type FilterNames,
} from "./applied-filters";
import { QUICK_FILTERS } from "./quick-filters";
import { DEFAULT_FILTERS } from "./search-filters";

const NAMES: FilterNames = {
  attributes: [
    { code: "GA", description: "GenEd Arts" },
    { code: "GW", description: "GenEd Analyt Reading/Writing" },
    { code: "WI", description: "Writing Intensive" },
  ],
  campuses: [{ code: "MN", description: "Main" }],
  partsOfTerm: [
    {
      code: "07A",
      description: "7-week Courses (7A) 01/11/2027 - 03/08/2027",
    },
  ],
};
const CONTEXT = { genEdCodes: ["GA", "GW"] };

function labels(filters = DEFAULT_FILTERS, base = DEFAULT_FILTERS) {
  return appliedFilters(filters, NAMES, base).map((f) => f.label);
}

describe("appliedFilters", () => {
  it("is empty for the defaults and blank instructor names", () => {
    expect(labels()).toEqual([]);
    expect(labels({ ...DEFAULT_FILTERS, instructor: "   " })).toEqual([]);
  });

  it("names each filter in use, in the panel's order", () => {
    expect(
      labels({
        ...DEFAULT_FILTERS,
        attributes: ["GA", "GW", "WI"],
        levels: [3000, 1000],
        campus: "MN",
        partOfTerm: "07A",
        instructor: " Hamid ",
        minRating: 4,
        maxDifficulty: 2.5,
        startAfter: 600,
        endBefore: null,
        days: ["M", "W"],
        openOnly: true,
      }),
    ).toEqual([
      "Open seats",
      "Mon Wed",
      "Starts after 10:00 AM",
      "7-week Courses (7A)",
      "Rating 4.0+",
      "Difficulty ≤2.5",
      "Instructor: Hamid",
      "Main",
      "Level 1000s, 3000s",
      "GenEd Arts, GenEd Analyt Reading/Writing +1",
    ]);
  });

  it("describes a time range with both ends", () => {
    expect(
      labels({ ...DEFAULT_FILTERS, startAfter: 720, endBefore: 1080 }),
    ).toEqual(["12:00 PM–6:00 PM"]);
  });
});

describe("quickFilterBase", () => {
  it("leaves out what pressed quick filters already show", () => {
    const online = QUICK_FILTERS.find((q) => q.label === "Online")!;
    const filters = {
      ...online.turn(DEFAULT_FILTERS, true, CONTEXT),
      campus: "MN",
    };
    const base = quickFilterBase(filters, CONTEXT);
    expect(labels(filters, base)).toEqual(["Main"]);
  });

  it("chips a format added beside a quick one, and removing it keeps the quick one", () => {
    const filters = {
      ...DEFAULT_FILTERS,
      formats: ["inPerson" as const, "hybrid" as const],
    };
    const base = quickFilterBase(filters, CONTEXT);
    expect(labels(filters, base)).toEqual(["In person, Hybrid"]);
    expect(removeFilter(filters, "formats", base).formats).toEqual([
      "inPerson",
    ]);
  });
});

describe("removeFilter", () => {
  it("resets both ends of a time range", () => {
    const filters = { ...DEFAULT_FILTERS, startAfter: 600, endBefore: 900 };
    expect(removeFilter(filters, "times")).toEqual(DEFAULT_FILTERS);
  });
});
