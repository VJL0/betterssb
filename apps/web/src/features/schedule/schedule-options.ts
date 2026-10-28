import type { CalendarMeeting } from "@workspace/shared/lib/ics";
import {
  WEEKDAYS,
  parseClockTime,
  parseDays,
  type WeekDay,
} from "@workspace/shared/lib/meeting-times";
import {
  courseKey,
  plannedSectionFrom,
  splitCourseCode,
} from "@workspace/shared/lib/plan";
import {
  LONG_GAP_MINUTES,
  scheduleStats,
  usesOnlyDays,
  type ScheduleStats,
} from "@workspace/shared/lib/schedule-stats";
import { ratedScore } from "@workspace/shared/lib/ratings";
import { FEW_SEATS_THRESHOLD } from "@workspace/shared/lib/seats";
import {
  isSupportScheduleType,
  primaryInstructorName,
  ssbSectionToInternal,
} from "@workspace/shared/lib/sections";
import type { TermPlan } from "@workspace/shared/types/store";
import type { RatingLookup } from "@/hooks/use-ratings";
import type {
  ClassSection,
  GeneratedSchedule,
  SectionOutput as Section,
} from "@workspace/api-client";

export type RankBy = "best" | "rating" | "fewerDays";
/** "planned" keeps a course to the sections already in the plan. */
export type CourseMode = "any" | "planned";

export interface ScheduleRules {
  days: WeekDay[];
  /** Minutes after midnight; null for any time. */
  startAfter: number | null;
  endBefore: number | null;
  rankBy: RankBy;
  modes: Record<string, CourseMode>;
}

export const DEFAULT_RULES: ScheduleRules = {
  days: [...WEEKDAYS],
  startAfter: null,
  endBefore: null,
  rankBy: "best",
  modes: {},
};

export interface PlanCourse {
  /** Banner's subjectCourse, e.g. "CIS2168". */
  courseId: string;
  code: string;
  subject: string;
  courseNumber: string;
  title: string;
  credits: number | null;
  /** CRNs of this course already in the plan. */
  plannedCrns: string[];
  /** Their section numbers ("001", "L02"), for display. */
  plannedSections: string[];
}

/**
 * The plan's courses that can be scheduled: those with planned sections, and
 * planned courses with a real code. Placeholders like "CIS elective" can't be.
 */
export function planCourses(plan: TermPlan): PlanCourse[] {
  const courses = new Map<string, PlanCourse>();
  for (const section of plan.sections) {
    const parts = splitCourseCode(section.courseCode);
    if (!parts) continue;
    const existing = courses.get(section.courseId);
    if (existing) {
      existing.plannedCrns.push(section.crn);
      existing.plannedSections.push(section.section);
      continue;
    }
    courses.set(section.courseId, {
      courseId: section.courseId,
      code: section.courseCode,
      ...parts,
      title: section.title,
      credits: section.credits,
      plannedCrns: [section.crn],
      plannedSections: [section.section],
    });
  }
  for (const course of plan.courses) {
    const parts = course.code ? splitCourseCode(course.code) : null;
    if (!course.code || !parts) continue;
    const id = courseKey(course.code);
    if (courses.has(id)) continue;
    courses.set(id, {
      courseId: id,
      code: course.code,
      ...parts,
      title: course.title,
      credits: course.credits,
      plannedCrns: [],
      plannedSections: [],
    });
  }
  // A stable order, so saving a schedule doesn't change what's generated.
  return [...courses.values()].sort((a, b) => a.code.localeCompare(b.code));
}

function fitsRules(
  section: ClassSection,
  rules: ScheduleRules,
  checkDays: boolean,
): boolean {
  const meetings = ssbSectionToInternal(section);
  if (meetings.length === 0) return false;
  return meetings.every(
    (m) =>
      (rules.startAfter === null ||
        parseClockTime(m.startTime) >= rules.startAfter) &&
      (rules.endBefore === null ||
        parseClockTime(m.endTime) <= rules.endBefore) &&
      (!checkDays || parseDays(m.days).every((d) => rules.days.includes(d))),
  );
}

/**
 * The meeting blocks the generator may choose from. The rules are hard
 * limits, so sections outside them are left out up front rather than ranked
 * low. Sections without a meeting time can't be placed on a week.
 * `checkDays: false` widens the search for the "allow a day" suggestion.
 */
export function candidateMeetings(
  courses: readonly PlanCourse[],
  sectionsByCourse: ReadonlyMap<string, readonly ClassSection[]>,
  rules: ScheduleRules,
  { checkDays = true }: { checkDays?: boolean } = {},
): Section[] {
  return courses.flatMap((course) => {
    const keepPlanned =
      rules.modes[course.courseId] === "planned" &&
      course.plannedCrns.length > 0;
    return (sectionsByCourse.get(course.courseId) ?? [])
      .filter(
        (s) =>
          (!keepPlanned ||
            course.plannedCrns.includes(s.courseReferenceNumber)) &&
          fitsRules(s, rules, checkDays),
      )
      .flatMap(ssbSectionToInternal);
  });
}

function componentKey(meeting: Section): string {
  return `${meeting.courseId}|${meeting.scheduleType}`;
}

/**
 * Courses missing a part in `meetings` that `available` has: no sections
 * left at all, or a lecture left without its lab. A schedule can't take
 * half a course.
 */
function incompleteCourses(
  courses: readonly PlanCourse[],
  available: readonly Section[],
  meetings: readonly Section[],
): Set<string> {
  const kept = new Set(meetings.map(componentKey));
  const missing = new Set(
    available.filter((m) => !kept.has(componentKey(m))).map((m) => m.courseId),
  );
  const placed = new Set(meetings.map((m) => m.courseId));
  return new Set(
    courses
      .filter((c) => missing.has(c.courseId) || !placed.has(c.courseId))
      .map((c) => c.courseId),
  );
}

function withoutCourses(
  meetings: readonly Section[],
  courseIds: ReadonlySet<string>,
): Section[] {
  return meetings.filter((m) => !courseIds.has(m.courseId));
}

export interface Placement {
  /** What the generator gets. Empty when the day rule rules out a whole course. */
  meetings: Section[];
  /** The same without the day rule, for suggesting a day; null when every day is allowed. */
  widened: Section[] | null;
  /** True when no section can go on a week even with every day allowed. */
  nothingToPlace: boolean;
  /** Why a course is missing from the schedules, by course id. */
  notes: Map<string, string>;
}

/**
 * Applies the rules to each course's sections. A course with no timed
 * section (online only) or none within the time rules is left out of the
 * schedules with a note. One the day rule rules out entirely leaves no
 * schedule at all, so the builder can suggest a day to turn back on.
 */
export function placeCourses(
  courses: readonly PlanCourse[],
  sectionsByCourse: ReadonlyMap<string, readonly ClassSection[]>,
  rules: ScheduleRules,
  loaded: boolean,
): Placement {
  if (!loaded) {
    return {
      meetings: [],
      widened: null,
      nothingToPlace: false,
      notes: new Map(),
    };
  }
  const anyTime = candidateMeetings(
    courses,
    sectionsByCourse,
    {
      ...rules,
      startAfter: null,
      endBefore: null,
    },
    { checkDays: false },
  );
  const withinTimes = candidateMeetings(courses, sectionsByCourse, rules, {
    checkDays: false,
  });
  const withinRules = candidateMeetings(courses, sectionsByCourse, rules);

  const untimed = incompleteCourses(courses, anyTime, anyTime);
  const outsideTimes = incompleteCourses(courses, anyTime, withinTimes);
  const outsideDays = incompleteCourses(courses, anyTime, withinRules);
  const notes = new Map<string, string>();
  for (const course of courses) {
    const id = course.courseId;
    if (untimed.has(id)) notes.set(id, "Online or no set time");
    else if (outsideTimes.has(id)) notes.set(id, "No section fits your times");
    else if (outsideDays.has(id)) notes.set(id, "No section fits these days");
  }
  const blockedByDays = [...outsideDays].some((id) => !outsideTimes.has(id));
  const daysLimited = rules.days.length < WEEKDAYS.length;
  const placeable = withoutCourses(withinTimes, outsideTimes);

  return {
    meetings: blockedByDays ? [] : withoutCourses(withinRules, outsideTimes),
    widened: daysLimited ? placeable : null,
    nothingToPlace: placeable.length === 0,
    notes,
  };
}

/**
 * How many section combinations the generator will try: one section per
 * course component (a lab is chosen separately from its lecture).
 */
export function combinationCount(meetings: readonly Section[]): number {
  const crnsByComponent = new Map<string, Set<string>>();
  for (const m of meetings) {
    const key = `${m.courseId}|${m.scheduleType}`;
    crnsByComponent.set(
      key,
      (crnsByComponent.get(key) ?? new Set()).add(m.crn),
    );
  }
  if (crnsByComponent.size === 0) return 0;
  return [...crnsByComponent.values()].reduce((n, crns) => n * crns.size, 1);
}

export type TagTone = "success" | "warning" | "destructive" | "neutral";

export interface ScheduleTag {
  label: string;
  tone: TagTone;
}

export interface ScheduleOption {
  /** The schedule's CRNs, sorted, so a choice survives re-ranking. */
  id: string;
  score: number;
  meetings: Section[];
  crns: string[];
  stats: ScheduleStats;
  /** Mean rating of the lecture instructors; null if none are rated. */
  averageRating: number | null;
  tags: ScheduleTag[];
}

function averageRating(
  sections: readonly ClassSection[],
  ratings: ReadonlyMap<string, RatingLookup>,
): number | null {
  const values = sections
    .filter((s) => !isSupportScheduleType(s.scheduleTypeDescription))
    .map((s) => ratedScore(ratings.get(primaryInstructorName(s))))
    .filter((r): r is number => r !== null);
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function tagsFor(
  stats: ScheduleStats,
  rating: number | null,
  sections: readonly ClassSection[],
): ScheduleTag[] {
  const tags: ScheduleTag[] = [];
  if (!stats.daysOnCampus.includes("F")) {
    tags.push({ label: "Fridays off", tone: "success" });
  }
  if (rating !== null) {
    tags.push({ label: `Avg ${rating.toFixed(1)}`, tone: "neutral" });
  }
  const seats = sections.map((s) => s.seatsAvailable);
  if (seats.some((n) => n <= 0)) {
    tags.push({ label: "Full section", tone: "destructive" });
  } else if (seats.some((n) => n < FEW_SEATS_THRESHOLD)) {
    tags.push({ label: "Few seats", tone: "warning" });
  }
  if (stats.longestGap >= LONG_GAP_MINUTES) {
    tags.push({ label: "Long gap", tone: "warning" });
  }
  return tags;
}

function compare(rankBy: RankBy) {
  return (a: ScheduleOption, b: ScheduleOption): number => {
    if (rankBy === "rating") {
      const diff = (b.averageRating ?? -1) - (a.averageRating ?? -1);
      if (diff !== 0) return diff;
    }
    if (rankBy === "fewerDays") {
      const diff = a.stats.daysOnCampus.length - b.stats.daysOnCampus.length;
      if (diff !== 0) return diff;
    }
    return b.score - a.score;
  };
}

/** Generated schedules, ranked and tagged. */
export function buildOptions(
  schedules: readonly GeneratedSchedule[],
  sectionsByCrn: ReadonlyMap<string, ClassSection>,
  ratings: ReadonlyMap<string, RatingLookup>,
  rankBy: RankBy,
): ScheduleOption[] {
  return schedules
    .map((schedule) => {
      const crns = [...new Set(schedule.sections.map((m) => m.crn))];
      const sections = crns.flatMap((crn) => sectionsByCrn.get(crn) ?? []);
      const stats = scheduleStats(schedule.sections);
      const rating = averageRating(sections, ratings);
      return {
        id: [...crns].sort().join("-"),
        score: schedule.score,
        meetings: schedule.sections,
        crns,
        stats,
        averageRating: rating,
        tags: tagsFor(stats, rating, sections),
      };
    })
    .sort(compare(rankBy));
}

/**
 * For when the day rule leaves no schedule: the one day that, turned back on,
 * allows the most of `widened` (schedules generated with every day allowed).
 */
export function dayToAllow(
  widened: readonly GeneratedSchedule[],
  allowedDays: readonly WeekDay[],
): { day: WeekDay; schedules: number } | null {
  let best: { day: WeekDay; schedules: number } | null = null;
  for (const day of WEEKDAYS) {
    if (allowedDays.includes(day)) continue;
    const days = new Set([...allowedDays, day]);
    const count = widened.filter((s) => usesOnlyDays(s.sections, days)).length;
    if (count > 0 && (!best || count > best.schedules)) {
      best = { day, schedules: count };
    }
  }
  return best;
}

/** Calendar events for a schedule's sections, for the .ics export. */
export function calendarMeetings(
  sections: readonly ClassSection[],
): CalendarMeeting[] {
  return sections.flatMap((section) => {
    const planned = plannedSectionFrom(section, "");
    return planned.meetings.flatMap((m, index) =>
      m.start === null || m.end === null || !m.startDate || !m.endDate
        ? []
        : [
            {
              uid: `${section.term}-${section.courseReferenceNumber}-${index}@betterssb`,
              summary: `${planned.courseCode} ${planned.scheduleType}`,
              location: m.location,
              description: `${planned.title} · Section ${planned.section} · CRN ${planned.crn} · ${planned.instructor}`,
              days: m.days,
              start: m.start,
              end: m.end,
              startDate: m.startDate,
              endDate: m.endDate,
            },
          ],
    );
  });
}
