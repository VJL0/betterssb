import { describe, expect, it } from "vitest";
import {
  formatRating,
  ratedDifficulty,
  ratedScore,
  ratingBand,
  rmpSearchUrl,
} from "./ratings";
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

describe("ratedScore", () => {
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

  it("is a rated profile's overall score", () => {
    expect(ratedScore(rating(12))).toBe(4.2);
  });

  it("is null for a profile nobody has rated, not its 0.0", () => {
    expect(ratedScore(rating(0))).toBeNull();
  });

  it("is null without a profile", () => {
    expect(ratedScore(null)).toBeNull();
    expect(ratedScore(undefined)).toBeNull();
  });

  it("gives difficulty only for a rated profile", () => {
    expect(ratedDifficulty(rating(12))).toBe(3.1);
    expect(ratedDifficulty(rating(0))).toBeNull();
    expect(ratedDifficulty(null)).toBeNull();
  });
});

describe("rmpSearchUrl", () => {
  it("searches Temple's professors by first and last name", () => {
    expect(rmpSearchUrl("Bray, Benjamin R.")).toBe(
      "https://www.ratemyprofessors.com/search/professors/999?q=Benjamin%20Bray",
    );
  });
});
