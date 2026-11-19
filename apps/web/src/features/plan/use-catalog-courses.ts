import { queryOptions, useQueries } from "@tanstack/react-query";
import type { CourseDescription } from "@workspace/api-client";
import { listSubjectCoursesOptions } from "@workspace/api-client/query";
import { subjectsByFrequency } from "@workspace/shared/lib/plan";
import type { CatalogCourse } from "@workspace/shared/lib/plan-optimizer";
import { catalogCredits } from "@workspace/shared/lib/planner";

/** Subjects read at most; a long GenEd list names many, and its first ones are enough. */
const MAX_SUBJECTS = 12;

function catalogCourse(course: CourseDescription): CatalogCourse {
  return {
    title: course.title,
    credits: catalogCredits(course.credits),
    prerequisites: course.prerequisiteCourses,
  };
}

/** A subject's courses in a Bulletin year; a published Bulletin doesn't change. */
export function subjectCoursesOptions(subject: string, year: string) {
  return queryOptions({
    ...listSubjectCoursesOptions({
      path: { subject },
      query: { year },
      meta: { errorMessage: `Couldn't load ${subject} from the Bulletin.` },
    }),
    staleTime: "static",
  });
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
  const subjects = subjectsByFrequency(codes).slice(0, MAX_SUBJECTS);
  const { entries, loading } = useQueries({
    queries: subjects.map((subject) => subjectCoursesOptions(subject, year)),
    combine: combineSubjects,
  });

  return {
    catalog: (code: string) => entries.get(code) ?? null,
    loading,
  };
}
