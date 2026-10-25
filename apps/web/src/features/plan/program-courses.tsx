"use client";

import { useQuery } from "@tanstack/react-query";
import { CircleXIcon } from "lucide-react";
import { useMemo } from "react";
import {
  queryError,
  type CourseRef,
  type DegreeProgram,
} from "@workspace/api-client";
import { getProgramRequirementsOptions } from "@workspace/api-client/query";
import { formatCredits } from "@workspace/shared/lib/dars";
import { courseCode } from "@workspace/shared/lib/plan";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert";
import { Skeleton } from "@workspace/ui/components/skeleton";
import type { NewCourse } from "./course-drag";
import { CourseRow } from "./course-row";

interface ProgramCoursesProps {
  /** The program's Bulletin page. */
  url: string;
  statusOf: (code: string) => string | null;
  targetName: string | null;
  onAdd: (course: NewCourse) => void;
}

interface CourseGroup {
  name: string;
  courses: CourseRef[];
}

/** The program's courses by requirement group, each listed once, where it first appears. */
function programCourseGroups(program: DegreeProgram): CourseGroup[] {
  const seen = new Set<string>();
  const groups = new Map<string, CourseRef[]>();
  for (const category of program.categories) {
    for (const group of category.groups) {
      // A category with a single list leaves its group unnamed.
      const name = group.name || category.name;
      const courses = groups.get(name) ?? [];
      for (const item of group.items) {
        for (const option of item.options) {
          for (const course of option.courses) {
            const code = courseCode(course.subject, course.number);
            if (seen.has(code)) continue;
            seen.add(code);
            courses.push(course);
          }
        }
      }
      if (courses.length > 0) groups.set(name, courses);
    }
  }
  return [...groups].map(([name, courses]) => ({ name, courses }));
}

function newCourse(course: CourseRef): NewCourse {
  return {
    code: courseCode(course.subject, course.number),
    title: course.title,
    credits: course.credits ?? null,
    requirement: null,
  };
}

/** W2.3 panel tab: the courses the student's Bulletin program lists. */
export function ProgramCourses({
  url,
  statusOf,
  targetName,
  onAdd,
}: ProgramCoursesProps) {
  const requirements = useQuery({
    ...getProgramRequirementsOptions({
      query: { url },
      meta: { errorMessage: "Couldn't load requirements from the Bulletin." },
    }),
    // A published Bulletin page doesn't change.
    staleTime: Infinity,
  });
  const groups = useMemo(
    () => (requirements.data ? programCourseGroups(requirements.data) : []),
    [requirements.data],
  );

  if (requirements.isPending) {
    return (
      <div
        role="status"
        aria-label="Loading program courses"
        className="flex flex-col gap-1.5 px-2"
      >
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-11 rounded-xl" />
        ))}
      </div>
    );
  }
  if (requirements.isError) {
    return (
      <Alert variant="destructive" className="mx-2 w-auto">
        <CircleXIcon />
        <AlertTitle>Couldn't load your program</AlertTitle>
        <AlertDescription>
          {queryError(requirements.error)?.message ??
            "Couldn't load requirements from the Bulletin."}
        </AlertDescription>
      </Alert>
    );
  }
  if (groups.length === 0) {
    return (
      <p className="mx-2 rounded-2xl border border-dashed p-4 text-center text-muted-foreground">
        Your program's page doesn't list courses by number.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {groups.map((group) => (
        <section key={group.name} aria-label={group.name}>
          <h3 className="px-2 pb-1 text-xs font-medium text-muted-foreground">
            {group.name}
          </h3>
          <ul className="flex flex-col">
            {group.courses.map((course) => {
              const code = courseCode(course.subject, course.number);
              const planned = newCourse(course);
              return (
                <CourseRow
                  key={code}
                  course={planned}
                  subtitle={course.title}
                  credits={
                    course.credits === null
                      ? null
                      : `${formatCredits(course.credits)} cr`
                  }
                  status={statusOf(code)}
                  targetName={targetName}
                  onAdd={() => onAdd(planned)}
                />
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
