import {
  parseClockTime,
  parseDays,
  WEEKDAYS,
  type WeekDay,
} from "@workspace/shared/lib/meeting-times";
import {
  meetingTimeToDays,
  primaryInstructorName,
} from "@workspace/shared/lib/sections";
import type { RatingLookup } from "@/hooks/use-ratings";
import type { ClassSection } from "@workspace/api-client";

export const MIN_RATING_OPTIONS = [0, 3.5, 4] as const;
export type MinRating = (typeof MIN_RATING_OPTIONS)[number];

export interface SearchFilters {
  /** Sections may only meet on these days. */
  days: WeekDay[];
  minRating: MinRating;
  openOnly: boolean;
  /** Minutes after midnight, or null for any time. */
  startAfter: number | null;
  endBefore: number | null;
  /** Section must have at least one of these Banner attribute codes. */
  attributes: string[];
}

export const DEFAULT_FILTERS: SearchFilters = {
  days: [...WEEKDAYS],
  minRating: 0,
  openOnly: false,
  startAfter: null,
  endBefore: null,
  attributes: [],
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

function meetsRating(section: ClassSection, min: MinRating, ratings: Ratings) {
  if (min === 0) return true;
  const rating = ratings.get(primaryInstructorName(section));
  // Still loading: keep it, so rows don't vanish and reappear.
  if (rating === undefined) return true;
  return rating !== null && rating.overallRating >= min;
}

type FilterCheck = (s: ClassSection, f: SearchFilters, r: Ratings) => boolean;

const CHECKS: Record<keyof SearchFilters, FilterCheck> = {
  days: (s, f) => meetsOnAllowedDays(s, f.days),
  minRating: (s, f, r) => meetsRating(s, f.minRating, r),
  openOnly: (s, f) => !f.openOnly || s.seatsAvailable > 0,
  startAfter: (s, f) => withinTimes(s, f),
  endBefore: (s, f) => withinTimes(s, f),
  attributes: (s, f) =>
    f.attributes.length === 0 ||
    s.sectionAttributes.some((a) => f.attributes.includes(a.code)),
};

export function sectionPasses(
  section: ClassSection,
  filters: SearchFilters,
  ratings: Ratings,
): boolean {
  return Object.values(CHECKS).every((check) =>
    check(section, filters, ratings),
  );
}

export function activeFilterCount(filters: SearchFilters): number {
  return [
    filters.days.length < WEEKDAYS.length,
    filters.minRating > 0,
    filters.openOnly,
    filters.startAfter !== null,
    filters.endBefore !== null,
    filters.attributes.length > 0,
  ].filter(Boolean).length;
}

export type FilterName =
  "days" | "minRating" | "openOnly" | "times" | "attributes";

const RESETS: Record<FilterName, (f: SearchFilters) => SearchFilters> = {
  days: (f) => ({ ...f, days: DEFAULT_FILTERS.days }),
  minRating: (f) => ({ ...f, minRating: 0 }),
  openOnly: (f) => ({ ...f, openOnly: false }),
  times: (f) => ({ ...f, startAfter: null, endBefore: null }),
  attributes: (f) => ({ ...f, attributes: [] }),
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
