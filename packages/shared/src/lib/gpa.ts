import type { SavedCourse } from "./transcript";

/**
 * Temple's grade points, best first. A grade outside this scale (W, CR, TR,
 * NT, P, I…) earns no GPA hours.
 */
export const GRADE_POINTS = {
  A: 4,
  "A-": 3.67,
  "B+": 3.33,
  B: 3,
  "B-": 2.67,
  "C+": 2.33,
  C: 2,
  "C-": 1.67,
  "D+": 1.33,
  D: 1,
  "D-": 0.67,
  F: 0,
} as const;

export type LetterGrade = keyof typeof GRADE_POINTS;

export const LETTER_GRADES = Object.keys(GRADE_POINTS) as LetterGrade[];

/** Banner's repeat flag for an attempt a later one replaced. */
const EXCLUDED_REPEAT = "E";

export type GpaCourse = Pick<
  SavedCourse,
  "credits" | "grade" | "category" | "repeat"
>;

export interface GpaTotals {
  hours: number;
  qualityPoints: number;
}

export function isLetterGrade(grade: string): grade is LetterGrade {
  return Object.hasOwn(GRADE_POINTS, grade);
}

/**
 * Whether a course's grade goes into the Temple GPA: a letter grade earned
 * here (or expected, for one in progress), and not an attempt a repeat replaced.
 * Transfer credit never counts.
 */
export function countsTowardGpa(course: GpaCourse): boolean {
  return (
    course.category !== "transfer" &&
    course.repeat !== EXCLUDED_REPEAT &&
    isLetterGrade(course.grade)
  );
}

/** GPA hours and quality points, as the transcript's totals add them up. */
export function gpaTotals(courses: readonly GpaCourse[]): GpaTotals {
  return courses.filter(countsTowardGpa).reduce(
    (totals, course) => ({
      hours: totals.hours + course.credits,
      qualityPoints:
        totals.qualityPoints +
        GRADE_POINTS[course.grade as LetterGrade] * course.credits,
    }),
    { hours: 0, qualityPoints: 0 },
  );
}

export function gpaOf(totals: GpaTotals): number | null {
  return totals.hours > 0 ? totals.qualityPoints / totals.hours : null;
}

/** The average grade points over `openCredits` more credits that lands on `target`. */
export function neededAverage(
  totals: GpaTotals,
  openCredits: number,
  target: number,
): number {
  return (
    (target * (totals.hours + openCredits) - totals.qualityPoints) / openCredits
  );
}

/** Absorbs float error, so needing exactly 3.33 finds a B+. */
const POINTS_TOLERANCE = 1e-9;

/** The lowest letter grade worth at least `points`, or null if even an A isn't. */
export function lowestGradeFor(points: number): LetterGrade | null {
  return (
    LETTER_GRADES.findLast(
      (grade) => GRADE_POINTS[grade] >= points - POINTS_TOLERANCE,
    ) ?? null
  );
}
