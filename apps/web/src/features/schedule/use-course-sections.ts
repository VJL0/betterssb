import { useCallback } from "react";
import { useQueries, type UseQueryResult } from "@tanstack/react-query";
import type { ClassSearchResult, ClassSection } from "@workspace/api-client";
import { searchSectionsOptions } from "@workspace/api-client/query";
import type { PlanCourse } from "./schedule-options";

/** The proxy's page cap; no course at Temple has more sections than this. */
const SECTIONS_PER_COURSE = 100;

export interface CourseSections {
  status: "idle" | "loading" | "ready" | "error";
  sectionsByCourse: ReadonlyMap<string, ClassSection[]>;
  /** Courses whose sections couldn't be loaded. */
  failed: PlanCourse[];
  /** ISO time of the oldest answer, since seats change. */
  fetchedAt: string | null;
  retry: () => void;
}

interface Loaded {
  pending: boolean;
  sectionsByCourse: Map<string, ClassSection[]>;
  fetchedAt: string | null;
  retry: () => void;
}

/** Only this exact course, whatever else the search matched. */
function onlyCourse(courseId: string) {
  return (result: ClassSearchResult): ClassSearchResult => ({
    ...result,
    sections: result.sections.filter((s) => s.subjectCourse === courseId),
  });
}

/** Live sections from Banner for every course in the plan. */
export function useCourseSections(
  term: string,
  courses: readonly PlanCourse[],
): CourseSections {
  const ids = courses.map((c) => c.courseId).join(",");

  // Keyed by the course ids alone, so the result only changes when the data does.
  const combine = useCallback(
    (results: UseQueryResult<ClassSearchResult, unknown>[]): Loaded => {
      const courseIds = ids.split(",");
      const sectionsByCourse = new Map<string, ClassSection[]>();
      const times: string[] = [];
      results.forEach((result, index) => {
        if (!result.data) return;
        sectionsByCourse.set(courseIds[index]!, result.data.sections);
        times.push(result.data.fetchedAt);
      });
      return {
        pending: results.some((r) => r.isPending && r.isFetching),
        sectionsByCourse,
        fetchedAt: times.sort()[0] ?? null,
        retry: () => {
          for (const r of results) if (r.isError) void r.refetch();
        },
      };
    },
    [ids],
  );

  const loaded = useQueries({
    queries: courses.map((course) => ({
      ...searchSectionsOptions({
        query: {
          term,
          subject: course.subject,
          courseNumber: course.courseNumber,
          limit: SECTIONS_PER_COURSE,
        },
        meta: { errorMessage: `Couldn't load ${course.code} sections.` },
      }),
      select: onlyCourse(course.courseId),
    })),
    combine,
  });

  const failed = loaded.pending
    ? []
    : courses.filter((c) => !loaded.sectionsByCourse.has(c.courseId));
  let status: CourseSections["status"];
  if (courses.length === 0) status = "idle";
  else if (loaded.pending) status = "loading";
  else if (failed.length === courses.length) status = "error";
  else status = "ready";

  return {
    status,
    sectionsByCourse: loaded.sectionsByCourse,
    failed,
    fetchedAt: loaded.fetchedAt,
    retry: loaded.retry,
  };
}
