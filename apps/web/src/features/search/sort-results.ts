import { parseClockTime } from "@workspace/shared/lib/meeting-times";
import { ratedDifficulty, ratedScore } from "@workspace/shared/lib/ratings";
import { primaryInstructorName } from "@workspace/shared/lib/sections";
import type { ClassSection } from "@workspace/api-client";
import type { RatingLookup } from "@/hooks/use-ratings";
import type { CourseGroup } from "./search-filters";

export const SORT_OPTIONS = {
  course: { label: "Course", needsRatings: false },
  rating: { label: "Highest rated", needsRatings: true },
  difficulty: { label: "Easiest", needsRatings: true },
  start: { label: "Earliest start", needsRatings: false },
  seats: { label: "Most open seats", needsRatings: false },
} as const;
export type SortKey = keyof typeof SORT_OPTIONS;

type Ratings = ReadonlyMap<string, RatingLookup>;

/** Smaller sorts first; null (no rating, no set time) sorts last. */
type SectionKey = (section: ClassSection, ratings: Ratings) => number | null;

function instructorRating(section: ClassSection, ratings: Ratings) {
  return ratings.get(primaryInstructorName(section));
}

function earliestStart(section: ClassSection): number | null {
  const starts = section.meetingsFaculty
    .map(({ meetingTime }) => meetingTime.beginTime)
    .filter((time): time is string => Boolean(time))
    .map(parseClockTime);
  return starts.length > 0 ? Math.min(...starts) : null;
}

const SECTION_KEYS: Record<Exclude<SortKey, "course">, SectionKey> = {
  rating: (s, r) => {
    const score = ratedScore(instructorRating(s, r));
    return score === null ? null : -score;
  },
  difficulty: (s, r) => ratedDifficulty(instructorRating(s, r)),
  start: (s) => earliestStart(s),
  seats: (s) => -s.seatsAvailable,
};

function compareKeys(a: number | null, b: number | null): number {
  if (a === null) return b === null ? 0 : 1;
  if (b === null) return -1;
  return a - b;
}

function sortedSections(
  sections: readonly ClassSection[],
  key: SectionKey,
  ratings: Ratings,
): ClassSection[] {
  // Array sort is stable, so ties keep Banner's order.
  return [...sections].sort((a, b) =>
    compareKeys(key(a, ratings), key(b, ratings)),
  );
}

/**
 * Sections sorted within each course, and courses by their best section,
 * so "Earliest start" puts the course with the earliest section first.
 * "course" keeps Banner's order.
 */
export function sortGroups(
  groups: readonly CourseGroup[],
  sort: SortKey,
  ratings: Ratings,
): CourseGroup[] {
  if (sort === "course") return [...groups];
  const key = SECTION_KEYS[sort];
  return groups
    .map((group) => ({
      ...group,
      sections: sortedSections(group.sections, key, ratings),
    }))
    .sort((a, b) =>
      compareKeys(key(a.sections[0]!, ratings), key(b.sections[0]!, ratings)),
    );
}
