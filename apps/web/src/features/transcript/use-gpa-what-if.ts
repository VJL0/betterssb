import { useState } from "react";
import {
  gpaOf,
  gpaTotals,
  isLetterGrade,
  type GpaTotals,
  type LetterGrade,
} from "@workspace/shared/lib/gpa";
import type {
  SavedCourse,
  TranscriptData,
} from "@workspace/shared/lib/transcript";

export interface GpaWhatIf {
  /** Puts every course back to its own grade. */
  revertAll: () => void;
  /** The grade being tried for a course, or its own when none is. */
  gradeOf: (course: SavedCourse) => string;
  /** Tries a letter grade; the course's own grade puts it back. */
  setGrade: (course: SavedCourse, grade: string) => void;
  /** How many courses have a what-if grade. */
  changed: number;
  whatIf: GpaTotals;
  /** The transcript's GPA, or its courses' when it has none. */
  actualGpa: number | null;
  whatIfGpa: number | null;
  /** Credits in progress without an expected grade, which a target solves for. */
  openCredits: number;
  hasCoursesInProgress: boolean;
}

type TriedGrades = ReadonlyMap<SavedCourse, LetterGrade>;

const NO_COURSES: SavedCourse[] = [];

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
export function useGpaWhatIf(transcript: TranscriptData | null): GpaWhatIf {
  const courses = transcript?.courses ?? NO_COURSES;
  // Keyed by the course itself; a re-saved transcript starts fresh.
  const [grades, setGrades] = useState<TriedGrades>(new Map());

  const tried = courses.map((course) => triedCourse(grades, course));
  const totals = {
    whatIf: gpaTotals(tried),
    openCredits: tried
      .filter((c) => c.category === "in_progress" && !isLetterGrade(c.grade))
      .reduce((sum, c) => sum + c.credits, 0),
  };

  return {
    revertAll: () => setGrades(new Map()),
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
    actualGpa: transcript?.gpa ?? gpaOf(gpaTotals(courses)),
    whatIfGpa: gpaOf(totals.whatIf),
    openCredits: totals.openCredits,
    hasCoursesInProgress: courses.some((c) => c.category === "in_progress"),
  };
}
