import { describe, expect, it } from "vitest";
import { formatRating, ratingBand } from "./ratings";

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
