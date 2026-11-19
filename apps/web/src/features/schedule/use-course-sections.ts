import { useCallback } from "react";
import { useQueries, type UseQueryResult } from "@tanstack/react-query";
import type { ClassSection, SectionPage } from "@workspace/api-client";
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

/** Live sections from Banner for every course in the plan. */
export function useCourseSections(
  term: string,
  courses: readonly PlanCourse[],
): CourseSections {
  const ids = courses.map((c) => c.courseId).join(",");

  // Keyed by the course ids alone, so the result only changes when the data does.
  const combine = useCallback(
    (results: UseQueryResult<SectionPage, unknown>[]): Loaded => {
      const courseIds = ids.split(",");
      const sectionsByCourse = new Map<string, ClassSection[]>();
      const times: string[] = [];
      for (const [index, result] of results.entries()) {
        if (!result.data) continue;
        const courseId = courseIds[index]!;
        // Only this exact course, whatever else the search matched.
        sectionsByCourse.set(
          courseId,
          result.data.sections.filter((s) => s.subjectCourse === courseId),
        );
        times.push(result.data.fetchedAt);
      }
      return {
        pending: results.some((r) => r.isLoading),
        sectionsByCourse,
        fetchedAt: times.toSorted()[0] ?? null,
        retry: () => {
          for (const r of results) if (r.isError) void r.refetch();
        },
      };
    },
    [ids],
  );

  const loaded = useQueries({
    queries: courses.map((course) =>
      searchSectionsOptions({
        path: { term },
        query: {
          subject: course.subject,
          courseNumber: course.courseNumber,
          limit: SECTIONS_PER_COURSE,
        },
        meta: { errorMessage: `Couldn't load ${course.code} sections.` },
      }),
    ),
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
