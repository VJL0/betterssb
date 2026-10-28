import { describe, expect, it } from "vitest";
import {
  bannerQuery,
  canSearchWithoutText,
  courseLevel,
  DEFAULT_BANNER_FILTERS,
  hasBannerFilters,
} from "./banner-filters";

describe("bannerQuery", () => {
  it("sends nothing for the defaults", () => {
    expect(bannerQuery(DEFAULT_BANNER_FILTERS)).toEqual({});
    expect(hasBannerFilters(DEFAULT_BANNER_FILTERS)).toBe(false);
  });

  it("sends each format's instructional methods", () => {
    expect(
      bannerQuery({ ...DEFAULT_BANNER_FILTERS, formats: ["hybrid", "async"] }),
    ).toEqual({ instructionalMethod: ["HYBR", "HYB2", "OLL"] });
  });

  it("sends codes as lists and a tidied instructor name", () => {
    expect(
      bannerQuery({
        ...DEFAULT_BANNER_FILTERS,
        attributes: ["GA", "GW"],
        campus: "MN",
        partOfTerm: "07A",
        instructor: "  Nahed   Hamid ",
      }),
    ).toEqual({
      attribute: ["GA", "GW"],
      campus: ["MN"],
      partOfTerm: ["07A"],
      instructor: "Nahed Hamid",
    });
  });

  it("leaves out a one-letter instructor", () => {
    expect(bannerQuery({ ...DEFAULT_BANNER_FILTERS, instructor: "h" })).toEqual(
      {},
    );
  });

  it.each([
    [[3000], "3000", "3999"],
    [[0, 1000], "0", "1999"],
    [[2000, 4000], "2000", "4999"],
    [[4000, 5000], "4000", "9999"],
  ] as const)(
    "turns levels %j into one course number range",
    (levels, from, to) => {
      expect(
        bannerQuery({ ...DEFAULT_BANNER_FILTERS, levels: [...levels] }),
      ).toEqual({ courseNumberFrom: from, courseNumberTo: to });
    },
  );
});

describe("courseLevel", () => {
  it.each([
    ["0802", 0],
    ["1041", 1000],
    ["2168H", 2000],
    ["4398", 4000],
    ["5043", 5000],
    ["9999", 5000],
  ] as const)("puts %s at %i", (number, level) => {
    expect(courseLevel(number)).toBe(level);
  });
});

describe("canSearchWithoutText", () => {
  it("needs an attribute or an instructor", () => {
    expect(canSearchWithoutText(DEFAULT_BANNER_FILTERS)).toBe(false);
    expect(
      canSearchWithoutText({ ...DEFAULT_BANNER_FILTERS, formats: ["async"] }),
    ).toBe(false);
    expect(
      canSearchWithoutText({ ...DEFAULT_BANNER_FILTERS, attributes: ["GA"] }),
    ).toBe(true);
    expect(
      canSearchWithoutText({ ...DEFAULT_BANNER_FILTERS, instructor: "Hamid" }),
    ).toBe(true);
  });
});
