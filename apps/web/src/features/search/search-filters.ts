import {
  parseClockTime,
  parseDays,
  WEEKDAYS,
  type WeekDay,
} from "@workspace/shared/lib/meeting-times";
import {
  meetingTimeToDays,
  primaryInstructorName,
  TBA_INSTRUCTOR,
} from "@workspace/shared/lib/sections";
import { ratedDifficulty, ratedScore } from "@workspace/shared/lib/ratings";
import type { RatingLookup } from "@/hooks/use-ratings";
import type { ClassSection } from "@workspace/api-client";
import {
  courseLevel,
  DEFAULT_BANNER_FILTERS,
  type BannerFilters,
} from "./banner-filters";

/** Rate My Professors' scale, for both rating and difficulty (1 easy, 5 hard). */
export const RMP_SCALE = { min: 1, max: 5, step: 0.5 } as const;

/**
 * Banner's filters plus the ones checked on the sections it returns. Days
 * stay here because Banner's day filter matches a meeting's exact pattern;
 * Banner ignores open-only; ratings aren't Banner's.
 */
export interface SearchFilters extends BannerFilters {
  /** Sections may only meet on these days. */
  days: WeekDay[];
  /** Rate My Professors scores, or null for any. */
  minRating: number | null;
  maxDifficulty: number | null;
  openOnly: boolean;
  /** Minutes after midnight, or null for any time. */
  startAfter: number | null;
  endBefore: number | null;
}

export const DEFAULT_FILTERS: SearchFilters = {
  ...DEFAULT_BANNER_FILTERS,
  days: [...WEEKDAYS],
  minRating: null,
  maxDifficulty: null,
  openOnly: false,
  startAfter: null,
  endBefore: null,
};

type Ratings = ReadonlyMap<string, RatingLookup>;

function meetsOnAllowedDays(section: ClassSection, days: readonly WeekDay[]) {
  return section.meetingsFaculty.every(({ meetingTime }) =>
    parseDays(meetingTimeToDays(meetingTime)).every((d) => days.includes(d)),
  );
}

function withinTimes(section: ClassSection, filters: SearchFilters) {
  return section.meetingsFaculty.every(({ meetingTime }) => {
    // Online and TBA meetings have no time to rule out.
    if (!meetingTime.beginTime || !meetingTime.endTime) return true;
    const start = parseClockTime(meetingTime.beginTime);
    const end = parseClockTime(meetingTime.endTime);
    return (
      (filters.startAfter === null || start >= filters.startAfter) &&
      (filters.endBefore === null || end <= filters.endBefore)
    );
  });
}

/**
 * Whether the instructor's Rate My Professors number passes. One with no
 * number (no profile, nobody has rated them, or not assigned yet) doesn't.
 */
function instructorPasses(
  section: ClassSection,
  ratings: Ratings,
  number: (rating: RatingLookup) => number | null,
  passes: (value: number) => boolean,
) {
  const name = primaryInstructorName(section);
  // TBA is never looked up, so it would otherwise look "still loading".
  if (name === TBA_INSTRUCTOR) return false;
  const rating = ratings.get(name);
  // Still loading: keep it, so rows don't vanish and reappear.
  if (rating === undefined) return true;
  const value = number(rating);
  return value !== null && passes(value);
}

function meetsRating(
  section: ClassSection,
  min: number | null,
  ratings: Ratings,
) {
  return (
    min === null ||
    instructorPasses(section, ratings, ratedScore, (score) => score >= min)
  );
}

function meetsDifficulty(
  section: ClassSection,
  max: number | null,
  ratings: Ratings,
) {
  return (
    max === null ||
    instructorPasses(section, ratings, ratedDifficulty, (d) => d <= max)
  );
}

/** Banner searched the range from the lowest level picked to the highest. */
function atPickedLevel(section: ClassSection, levels: readonly number[]) {
  return (
    levels.length === 0 || levels.includes(courseLevel(section.courseNumber))
  );
}

type FilterCheck = (s: ClassSection, f: SearchFilters, r: Ratings) => boolean;

const CHECKS: FilterCheck[] = [
  (s, f) => meetsOnAllowedDays(s, f.days),
  (s, f, r) => meetsRating(s, f.minRating, r),
  (s, f, r) => meetsDifficulty(s, f.maxDifficulty, r),
  (s, f) => !f.openOnly || s.seatsAvailable > 0,
  (s, f) => withinTimes(s, f),
  (s, f) => atPickedLevel(s, f.levels),
];

export function sectionPasses(
  section: ClassSection,
  filters: SearchFilters,
  ratings: Ratings,
): boolean {
  return CHECKS.every((check) => check(section, filters, ratings));
}

export function activeFilterCount(filters: SearchFilters): number {
  return [
    filters.days.length < WEEKDAYS.length,
    filters.minRating !== null,
    filters.maxDifficulty !== null,
    filters.openOnly,
    filters.startAfter !== null,
    filters.endBefore !== null,
    filters.formats.length > 0,
    filters.levels.length > 0,
    filters.attributes.length > 0,
    filters.campus !== null,
    filters.partOfTerm !== null,
    filters.instructor.trim() !== "",
  ].filter(Boolean).length;
}

/** Filters checked here, whose reset needs no new search to count. */
export type FilterName =
  "days" | "minRating" | "maxDifficulty" | "openOnly" | "times";

const RESETS: Record<FilterName, (f: SearchFilters) => SearchFilters> = {
  days: (f) => ({ ...f, days: DEFAULT_FILTERS.days }),
  minRating: (f) => ({ ...f, minRating: null }),
  maxDifficulty: (f) => ({ ...f, maxDifficulty: null }),
  openOnly: (f) => ({ ...f, openOnly: false }),
  times: (f) => ({ ...f, startAfter: null, endBefore: null }),
};

/**
 * When filters hide every section: the one filter whose reset brings back
 * the most, so the empty state can name it.
 */
export function mostRestrictiveFilter(
  sections: readonly ClassSection[],
  filters: SearchFilters,
  ratings: Ratings,
): { filter: FilterName; recovered: number } | null {
  let best: { filter: FilterName; recovered: number } | null = null;
  for (const [filter, reset] of Object.entries(RESETS) as [
    FilterName,
    (f: SearchFilters) => SearchFilters,
  ][]) {
    const relaxed = reset(filters);
    if (JSON.stringify(relaxed) === JSON.stringify(filters)) continue;
    const recovered = sections.filter((s) =>
      sectionPasses(s, relaxed, ratings),
    ).length;
    if (recovered > 0 && (!best || recovered > best.recovered)) {
      best = { filter, recovered };
    }
  }
  return best;
}

export function resetFilter(
  filters: SearchFilters,
  filter: FilterName,
): SearchFilters {
  return RESETS[filter](filters);
}

export interface CourseGroup {
  courseId: string;
  sections: ClassSection[];
}

/** Sections grouped by course, in the order Banner returned them. */
export function groupByCourse(
  sections: readonly ClassSection[],
): CourseGroup[] {
  const groups = new Map<string, ClassSection[]>();
  for (const section of sections) {
    const list = groups.get(section.subjectCourse) ?? [];
    list.push(section);
    groups.set(section.subjectCourse, list);
  }
  return [...groups].map(([courseId, list]) => ({ courseId, sections: list }));
}
