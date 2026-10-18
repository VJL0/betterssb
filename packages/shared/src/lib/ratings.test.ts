import { describe, expect, it } from "vitest";
import { formatRating, ratingBand, usableRating } from "./ratings";
import type { RmpRating } from "@workspace/api-client";

describe("ratingBand", () => {
  it.each([
    [4.6, "high"],
    [4, "high"],
    [3.9, "mid"],
    [3, "mid"],
    [2.9, "low"],
    [0, "low"],
    [null, "none"],
    [undefined, "none"],
    [Number.NaN, "none"],
  ] as const)("puts %s in the %s band", (rating, band) => {
    expect(ratingBand(rating)).toBe(band);
  });
});

describe("formatRating", () => {
  it("always prints one decimal", () => {
    expect(formatRating(4)).toBe("4.0");
    expect(formatRating(3.14)).toBe("3.1");
  });
});

describe("usableRating", () => {
  const rating = (numRatings: number): RmpRating => ({
    professorName: "Ada Lovelace",
    department: "Computer Science",
    overallRating: numRatings ? 4.2 : 0,
    difficulty: numRatings ? 3.1 : 0,
    numRatings,
    wouldTakeAgainPct: null,
    topTags: [],
    rmpUrl: "https://www.ratemyprofessors.com/professor/1",
  });

  it("keeps a rated profile", () => {
    expect(usableRating(rating(12))?.overallRating).toBe(4.2);
  });

  it("drops a profile nobody has rated", () => {
    expect(usableRating(rating(0))).toBeNull();
  });

  it("passes no profile through", () => {
    expect(usableRating(null)).toBeNull();
  });
});
