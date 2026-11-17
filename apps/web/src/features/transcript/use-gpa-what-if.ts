import { useMemo, useState } from "react";
import {
  countsTowardGpa,
  gpaOf,
  gpaTotals,
  isLetterGrade,
  type GpaTotals,
  type LetterGrade,
} from "@workspace/shared/lib/gpa";
import type { SavedCourse } from "@workspace/shared/lib/transcript";

/** A what-if grade for a course, or null to leave an in-progress one open. */
type WhatIfGrade = LetterGrade | null;

export interface GpaWhatIf {
  active: boolean;
  start: () => void;
  /** Leaves what-if mode, dropping every change. */
  done: () => void;
  reset: () => void;
  /** Whether a course's grade can be tried: a graded Temple course, or one in progress. */
  canChange: (course: SavedCourse) => boolean;
  gradeOf: (course: SavedCourse) => string;
  setGrade: (course: SavedCourse, grade: WhatIfGrade) => void;
  changed: number;
  whatIf: GpaTotals;
  nowGpa: number | null;
  whatIfGpa: number | null;
  /** Credits in progress without an expected grade, which a target solves for. */
  openCredits: number;
}

type WhatIfGrades = ReadonlyMap<SavedCourse, WhatIfGrade>;

function canChange(course: SavedCourse): boolean {
  return course.category === "in_progress" || countsTowardGpa(course);
}

function triedGrade(grades: WhatIfGrades, course: SavedCourse): string {
  return grades.has(course) ? (grades.get(course) ?? "") : course.grade;
}

/**
 * Grades to try on the transcript, kept in memory only: they never change
 * the saved transcript or what the advisor reads.
 */
export function useGpaWhatIf(courses: readonly SavedCourse[]): GpaWhatIf {
  const [active, setActive] = useState(false);
  // Keyed by the course itself; a re-saved transcript starts fresh.
  const [grades, setGrades] = useState<WhatIfGrades>(new Map());

  const totals = useMemo(() => {
    const tried = courses.map((course) => ({
      ...course,
      grade: triedGrade(grades, course),
    }));
    return {
      now: gpaTotals(courses),
      whatIf: gpaTotals(tried),
      openCredits: tried
        .filter((c) => c.category === "in_progress" && !isLetterGrade(c.grade))
        .reduce((sum, c) => sum + c.credits, 0),
    };
  }, [courses, grades]);

  const changed = [...grades].filter(
    ([course, grade]) => (grade ?? "") !== course.grade,
  ).length;

  return {
    active,
    start: () => setActive(true),
    done: () => {
      setActive(false);
      setGrades(new Map());
    },
    reset: () => setGrades(new Map()),
    canChange,
    gradeOf: (course) => triedGrade(grades, course),
    setGrade: (course, grade) =>
      setGrades((previous) => new Map(previous).set(course, grade)),
    changed,
    whatIf: totals.whatIf,
    nowGpa: gpaOf(totals.now),
    whatIfGpa: gpaOf(totals.whatIf),
    openCredits: totals.openCredits,
  };
}
