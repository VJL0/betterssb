import { useCallback, useEffect, useState } from "react";
import type { ClassSection } from "@workspace/shared/types/classes";
import { searchClasses } from "@/lib/api/classes";
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

interface Response {
  key: string;
  sectionsByCourse: Map<string, ClassSection[]>;
  failed: PlanCourse[];
  fetchedAt: string | null;
}

const EMPTY: Response = {
  key: "",
  sectionsByCourse: new Map(),
  failed: [],
  fetchedAt: null,
};

async function loadCourse(
  term: string,
  course: PlanCourse,
  signal: AbortSignal,
) {
  const result = await searchClasses(
    {
      term,
      subject: course.subject,
      courseNumber: course.courseNumber,
      limit: SECTIONS_PER_COURSE,
    },
    signal,
  );
  return {
    // Only this exact course, whatever else the search matched.
    sections: result.sections.filter(
      (s) => s.subjectCourse === course.courseId,
    ),
    fetchedAt: result.fetchedAt,
  };
}

/** Live sections from Banner for every course in the plan. */
export function useCourseSections(
  term: string,
  courses: readonly PlanCourse[],
): CourseSections {
  const [attempt, setAttempt] = useState(0);
  const [response, setResponse] = useState<Response>(EMPTY);
  const key = `${term}|${attempt}|${courses
    .map((c) => c.courseId)
    .sort()
    .join(",")}`;

  useEffect(() => {
    if (courses.length === 0) return;
    const controller = new AbortController();
    void Promise.allSettled(
      courses.map((c) => loadCourse(term, c, controller.signal)),
    ).then((results) => {
      if (controller.signal.aborted) return;
      const sectionsByCourse = new Map<string, ClassSection[]>();
      const failed: PlanCourse[] = [];
      const times: string[] = [];
      results.forEach((result, index) => {
        const course = courses[index]!;
        if (result.status === "fulfilled") {
          sectionsByCourse.set(course.courseId, result.value.sections);
          times.push(result.value.fetchedAt);
        } else {
          failed.push(course);
        }
      });
      setResponse({
        key,
        sectionsByCourse,
        failed,
        fetchedAt: times.sort()[0] ?? null,
      });
    });
    return () => controller.abort();
    // `key` covers the term, the course ids and retries.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  if (courses.length === 0) {
    return { ...EMPTY, status: "idle", retry };
  }
  if (response.key !== key) {
    return { ...EMPTY, status: "loading", retry };
  }
  const allFailed = response.failed.length === courses.length;
  return { ...response, status: allFailed ? "error" : "ready", retry };
}
