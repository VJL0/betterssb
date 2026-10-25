import { useQueries } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import type { CourseDescription } from "@workspace/api-client";
import { listSubjectCoursesOptions } from "@workspace/api-client/query";
import { splitCourseCode } from "@workspace/shared/lib/plan";
import type { CatalogCourse } from "@workspace/shared/lib/plan-optimizer";
import { catalogCredits } from "@workspace/shared/lib/planner";

/** Subjects read at most; a long GenEd list names many, and its first ones are enough. */
const MAX_SUBJECTS = 12;

/** The subjects of these codes, most-named first. */
function subjectsOf(codes: readonly string[]): string[] {
  const counts = new Map<string, number>();
  for (const code of codes) {
    const subject = splitCourseCode(code)?.subject;
    if (subject) counts.set(subject, (counts.get(subject) ?? 0) + 1);
  }
  return [...counts]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_SUBJECTS)
    .map(([subject]) => subject);
}

function catalogCourse(course: CourseDescription): CatalogCourse {
  return {
    title: course.title,
    credits: catalogCredits(course.credits),
    prerequisites: course.prerequisiteCourses,
  };
}

/** Every subject's courses by code; module-level so useQueries keeps its result stable. */
function combineSubjects(
  results: { data?: { courses: CourseDescription[] }; isPending: boolean }[],
) {
  const entries = new Map<string, CatalogCourse>();
  for (const result of results) {
    for (const course of result.data?.courses ?? []) {
      entries.set(course.code, catalogCourse(course));
    }
  }
  return { entries, loading: results.some((r) => r.isPending) };
}

/**
 * Bulletin entries for these course codes, read a subject at a time. `loading`
 * stays true until every subject has answered or failed; a failed subject's
 * courses simply have no entry.
 */
export function useCatalogCourses(codes: readonly string[], year: string) {
  const subjects = useMemo(() => subjectsOf(codes), [codes]);
  const { entries, loading } = useQueries({
    queries: subjects.map((subject) => ({
      ...listSubjectCoursesOptions({
        path: { subject },
        query: { year },
        meta: { errorMessage: `Couldn't load ${subject} from the Bulletin.` },
      }),
      // A published Bulletin doesn't change.
      staleTime: Infinity,
    })),
    combine: combineSubjects,
  });

  const catalog = useCallback(
    (code: string) => entries.get(code) ?? null,
    [entries],
  );
  return { catalog, loading };
}
