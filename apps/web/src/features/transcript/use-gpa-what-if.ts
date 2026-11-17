import { useMemo, useState } from "react";
import {
  gpaOf,
  gpaTotals,
  isLetterGrade,
  type GpaTotals,
  type LetterGrade,
} from "@workspace/shared/lib/gpa";
import type { SavedCourse } from "@workspace/shared/lib/transcript";

export interface GpaWhatIf {
  active: boolean;
  start: () => void;
  /** Leaves what-if mode, dropping every change. */
  done: () => void;
  reset: () => void;
  /** The grade being tried for a course, or its own when none is. */
  gradeOf: (course: SavedCourse) => string;
  /** Tries a letter grade; the course's own grade puts it back. */
  setGrade: (course: SavedCourse, grade: string) => void;
  changed: number;
  whatIf: GpaTotals;
  nowGpa: number | null;
  whatIfGpa: number | null;
  /** Credits in progress without an expected grade, which a target solves for. */
  openCredits: number;
  hasCoursesInProgress: boolean;
}

type TriedGrades = ReadonlyMap<SavedCourse, LetterGrade>;

/**
 * A course as the what-if GPA counts it. A picked letter grade counts as if
 * earned at Temple, so it also counts for a transfer course, a W or CR, or an
 * attempt a repeat replaced.
 */
function triedCourse(grades: TriedGrades, course: SavedCourse): SavedCourse {
  const grade = grades.get(course);
  return grade
    ? { ...course, grade, category: "institution", repeat: null }
    : course;
}

/**
 * Grades to try on the transcript, kept in memory only: they never change
 * the saved transcript or what the advisor reads.
 */
export function useGpaWhatIf(courses: readonly SavedCourse[]): GpaWhatIf {
  const [active, setActive] = useState(false);
  // Keyed by the course itself; a re-saved transcript starts fresh.
  const [grades, setGrades] = useState<TriedGrades>(new Map());

  const totals = useMemo(() => {
    const tried = courses.map((course) => triedCourse(grades, course));
    return {
      now: gpaTotals(courses),
      whatIf: gpaTotals(tried),
      openCredits: tried
        .filter((c) => c.category === "in_progress" && !isLetterGrade(c.grade))
        .reduce((sum, c) => sum + c.credits, 0),
    };
  }, [courses, grades]);

  return {
    active,
    start: () => setActive(true),
    done: () => {
      setActive(false);
      setGrades(new Map());
    },
    reset: () => setGrades(new Map()),
    gradeOf: (course) => grades.get(course) ?? course.grade,
    setGrade: (course, grade) =>
      setGrades((previous) => {
        const next = new Map(previous);
        if (isLetterGrade(grade) && grade !== course.grade) {
          next.set(course, grade);
        } else {
          next.delete(course);
        }
        return next;
      }),
    changed: grades.size,
    whatIf: totals.whatIf,
    nowGpa: gpaOf(totals.now),
    whatIfGpa: gpaOf(totals.whatIf),
    openCredits: totals.openCredits,
    hasCoursesInProgress: courses.some((c) => c.category === "in_progress"),
  };
}
