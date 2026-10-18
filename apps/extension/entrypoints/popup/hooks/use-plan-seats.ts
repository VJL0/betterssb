import { useQueries } from "@tanstack/react-query";
import type { ClassSection } from "@workspace/api-client";
import { searchSectionsOptions } from "@workspace/api-client/query";
import { splitCourseCode } from "@workspace/shared/lib/plan";
import type { PlannedSection } from "@workspace/shared/types/store";

/** The proxy's page cap; no course at Temple has more sections than this. */
const SECTIONS_PER_COURSE = 100;

export interface PlanSeats {
  byCrn: ReadonlyMap<string, ClassSection>;
  /** ISO time of the oldest answer, since seats change. */
  fetchedAt: string | null;
  loading: boolean;
}

/** Live seats for the plan's sections, one class search per course. */
export function usePlanSeats(
  term: string,
  sections: readonly PlannedSection[],
): PlanSeats {
  const courses = [
    ...new Map(sections.map((s) => [s.courseId, s.courseCode])).entries(),
  ].flatMap(([courseId, code]) => {
    const parts = splitCourseCode(code);
    return parts ? [{ courseId, ...parts }] : [];
  });

  return useQueries({
    queries: courses.map((course) =>
      searchSectionsOptions({
        query: {
          term,
          subject: course.subject,
          courseNumber: course.courseNumber,
          limit: SECTIONS_PER_COURSE,
        },
      }),
    ),
    combine: (results) => {
      const byCrn = new Map<string, ClassSection>();
      const times: string[] = [];
      for (const result of results) {
        if (!result.data) continue;
        times.push(result.data.fetchedAt);
        for (const s of result.data.sections) {
          byCrn.set(s.courseReferenceNumber, s);
        }
      }
      return {
        byCrn,
        fetchedAt: times.sort()[0] ?? null,
        loading: results.some((r) => r.isPending),
      };
    },
  });
}
