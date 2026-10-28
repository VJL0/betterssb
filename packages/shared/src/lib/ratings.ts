import type { RmpRating } from "@workspace/api-client";
import { instructorSearchName } from "./instructors";

export const HIGH_RATING_MIN = 4;
/** Temple University's main campus on Rate My Professors. */
const TEMPLE_RMP_SCHOOL_ID = 999;
export const MID_RATING_MIN = 3;

/** Rate My Professors score bands from the design: 4.0+, 3.0–3.9, under 3.0, no profile. */
export type RatingBand = "high" | "mid" | "low" | "none";

export function ratingBand(rating: number | null | undefined): RatingBand {
  if (rating == null || Number.isNaN(rating)) return "none";
  if (rating >= HIGH_RATING_MIN) return "high";
  if (rating >= MID_RATING_MIN) return "mid";
  return "low";
}

export function formatRating(rating: number): string {
  return rating.toFixed(1);
}

/**
 * An instructor's overall score, or null without one. A profile nobody has
 * rated reports 0.0, which would read as a terrible score, so it has none.
 */
export function ratedScore(
  rating: RmpRating | null | undefined,
): number | null {
  return rating && rating.numRatings > 0 ? rating.overallRating : null;
}

/** An instructor's difficulty, 1 easy to 5 hard, or null without ratings (RMP reports 0.0). */
export function ratedDifficulty(
  rating: RmpRating | null | undefined,
): number | null {
  return rating && rating.numRatings > 0 ? rating.difficulty : null;
}

/**
 * Rate My Professors' search for a Banner instructor ("Bray, Benjamin R.") at
 * Temple, for when we found no profile: it may be listed under another name.
 */
export function rmpSearchUrl(bannerName: string): string {
  const query = encodeURIComponent(instructorSearchName(bannerName));
  return `https://www.ratemyprofessors.com/search/professors/${TEMPLE_RMP_SCHOOL_ID}?q=${query}`;
}
