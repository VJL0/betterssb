import type { CourseLevel } from "./banner-filters";
import { formatRating } from "@workspace/shared/lib/ratings";

/** "3.5+", or "Any" with no minimum. */
export function minRatingLabel(min: number | null): string {
  return min === null ? "Any" : `${formatRating(min)}+`;
}

/** "≤2.5", or "Any" with no maximum. */
export function maxDifficultyLabel(max: number | null): string {
  return max === null ? "Any" : `≤${formatRating(max)}`;
}

export const LEVEL_LABEL: Record<CourseLevel, { short: string; name: string }> =
  {
    0: { short: "<1000", name: "Below 1000" },
    1000: { short: "1000s", name: "1000 level" },
    2000: { short: "2000s", name: "2000 level" },
    3000: { short: "3000s", name: "3000 level" },
    4000: { short: "4000s", name: "4000 level" },
    5000: { short: "5000+", name: "Graduate, 5000 and up" },
  };

const DATE_RANGE = /\s*\d{2}\/\d{2}\/\d{4}\s*-\s*\d{2}\/\d{2}\/\d{4}$/;

/** "7-week Courses (7A)", without the dates Banner adds to every part of term. */
export function partOfTermName(description: string): string {
  return description.replace(DATE_RANGE, "");
}
