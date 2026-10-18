export const HIGH_RATING_MIN = 4;
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
