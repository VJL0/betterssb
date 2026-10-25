"use client";

import { useQuery } from "@tanstack/react-query";
import { CircleXIcon, SearchIcon } from "lucide-react";
import { useDeferredValue, useId, useMemo, useState } from "react";
import {
  queryError,
  type CodeName,
  type CourseDescription,
} from "@workspace/api-client";
import {
  listBulletinSubjectsOptions,
  listSubjectCoursesOptions,
} from "@workspace/api-client/query";
import { catalogCredits } from "@workspace/shared/lib/planner";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert";
import { Button } from "@workspace/ui/components/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@workspace/ui/components/combobox";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@workspace/ui/components/input-group";
import { Skeleton } from "@workspace/ui/components/skeleton";
import type { NewCourse } from "./course-drag";
import { CourseRow } from "./course-row";

/** Course numbers from 5000 up are graduate courses at Temple. */
const GRADUATE_FROM = 5000;
/** Rows drawn at once; searching narrows the rest. */
const COURSES_SHOWN = 100;
/** Subjects listed in the picker before typing narrows them. */
const SUBJECTS_SHOWN = 60;
const NO_SUBJECTS: CodeName[] = [];

interface CatalogCoursesProps {
  /** The Bulletin year to read, "YYYY-YYYY". */
  year: string;
  /** The subject to open with, such as the one most of the plan is in. */
  initialSubject: string | null;
  /** Where a course already is, such as "In Fall 2027". */
  statusOf: (code: string) => string | null;
  targetName: string | null;
  onAdd: (course: NewCourse) => void;
}

function isGraduate(course: CourseDescription): boolean {
  const number = Number.parseInt(course.code.split(" ")[1] ?? "", 10);
  return number >= GRADUATE_FROM;
}

function matches(course: CourseDescription, query: string): boolean {
  const code = course.code.toLowerCase();
  return (
    code.includes(query) ||
    code.replace(" ", "").includes(query.replace(/\s+/g, "")) ||
    course.title.toLowerCase().includes(query)
  );
}

function newCourse(course: CourseDescription): NewCourse {
  return {
    code: course.code,
    title: course.title,
    credits: catalogCredits(course.credits),
    requirement: null,
  };
}

function CourseDetails({ course }: { course: CourseDescription }) {
  return (
    <>
      {course.description && <p>{course.description}</p>}
      {course.prerequisites && (
        <p>
          <span className="font-medium text-foreground">Prerequisites:</span>{" "}
          {course.prerequisites}
        </p>
      )}
      {course.attributes.length > 0 && (
        <p>
          <span className="font-medium text-foreground">Attributes:</span>{" "}
          {course.attributes.join(", ")}
        </p>
      )}
      <a
        href={course.bulletinUrl}
        target="_blank"
        rel="noreferrer"
        className="w-fit underline underline-offset-2 hover:text-foreground"
      >
        {course.code} on the Bulletin
      </a>
    </>
  );
}

/** W2.3 panel tab: every course of a subject in the student's Bulletin year. */
export function CatalogCourses({
  year,
  initialSubject,
  statusOf,
  targetName,
  onAdd,
}: CatalogCoursesProps) {
  const subjectId = useId();
  const [picked, setPicked] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showGraduate, setShowGraduate] = useState(false);
  const query = useDeferredValue(search.trim().toLowerCase());
  const subject = picked ?? initialSubject;

  const subjects = useQuery({
    ...listBulletinSubjectsOptions({
      query: { year },
      meta: { errorMessage: "Couldn't load subjects from the Bulletin." },
    }),
    // A published Bulletin doesn't change.
    staleTime: Infinity,
  });
  const courses = useQuery({
    ...listSubjectCoursesOptions({
      path: { subject: subject ?? "" },
      query: { year },
      meta: { errorMessage: "Couldn't load courses from the Bulletin." },
    }),
    enabled: subject !== null,
    staleTime: Infinity,
  });

  const subjectOptions = subjects.data?.subjects ?? NO_SUBJECTS;
  const selectedSubject =
    subjectOptions.find((s) => s.code === subject) ?? null;
  const all = courses.data?.courses;
  const { shown, matched, graduateHidden } = useMemo(() => {
    const found = (all ?? []).filter((c) => !query || matches(c, query));
    const visible = showGraduate ? found : found.filter((c) => !isGraduate(c));
    return {
      shown: visible.slice(0, COURSES_SHOWN),
      matched: visible.length,
      graduateHidden: found.length - visible.length,
    };
  }, [all, query, showGraduate]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 px-2">
        <label htmlFor={subjectId} className="sr-only">
          Subject
        </label>
        <Combobox
          items={subjectOptions}
          value={selectedSubject}
          onValueChange={(next: CodeName | null) => {
            if (next) setPicked(next.code);
          }}
          itemToStringLabel={(s: CodeName) => `${s.code} · ${s.name}`}
          itemToStringValue={(s: CodeName) => s.code}
          isItemEqualToValue={(a, b) => a.code === b.code}
          limit={SUBJECTS_SHOWN}
          disabled={!subjects.isSuccess}
        >
          <ComboboxInput
            id={subjectId}
            className="w-full"
            placeholder={
              subjects.isPending ? "Loading subjects…" : "Pick a subject"
            }
            disabled={!subjects.isSuccess}
          />
          <ComboboxContent>
            <ComboboxEmpty>No subjects match.</ComboboxEmpty>
            <ComboboxList>
              {(s: CodeName) => (
                <ComboboxItem key={s.code} value={s}>
                  <span className="font-medium">{s.code}</span>
                  <span className="text-muted-foreground">{s.name}</span>
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
        {subject && (
          <InputGroup>
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              aria-label={`Search ${subject} courses`}
              placeholder={`Search ${subject} by number or title`}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </InputGroup>
        )}
      </div>

      {subjects.isError ? (
        <CatalogError message={queryError(subjects.error)?.message} />
      ) : !subject ? (
        <p className="mx-2 rounded-2xl border border-dashed p-4 text-center text-muted-foreground">
          Pick a subject to see its courses.
        </p>
      ) : courses.isPending ? (
        <div
          role="status"
          aria-label="Loading courses"
          className="flex flex-col gap-1.5 px-2"
        >
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-11 rounded-xl" />
          ))}
        </div>
      ) : courses.isError ? (
        <CatalogError message={queryError(courses.error)?.message} />
      ) : (
        <>
          {shown.length > 0 ? (
            <ul aria-label={`${subject} courses`} className="flex flex-col">
              {shown.map((course) => (
                <CourseRow
                  key={course.code}
                  course={newCourse(course)}
                  subtitle={course.title}
                  credits={course.credits ? `${course.credits} cr` : null}
                  status={statusOf(course.code)}
                  targetName={targetName}
                  onAdd={() => onAdd(newCourse(course))}
                  details={<CourseDetails course={course} />}
                />
              ))}
            </ul>
          ) : (
            <p className="mx-2 rounded-2xl border border-dashed p-4 text-center text-muted-foreground">
              No {subject} courses match.
            </p>
          )}
          <div className="flex flex-col gap-1 px-2 text-xs text-muted-foreground">
            {matched > shown.length && (
              <p>
                Showing {shown.length} of {matched}. Search to narrow them down.
              </p>
            )}
            {graduateHidden > 0 && (
              <Button
                variant="link"
                size="xs"
                className="w-fit px-0"
                onClick={() => setShowGraduate(true)}
              >
                Show {graduateHidden} graduate{" "}
                {graduateHidden === 1 ? "course" : "courses"}
              </Button>
            )}
            {courses.data && (
              <p>
                From the{" "}
                <a
                  href={courses.data.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  {courses.data.bulletinYear} Bulletin
                </a>
                .
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function CatalogError({ message }: { message: string | undefined }) {
  return (
    <Alert variant="destructive" className="mx-2 w-auto">
      <CircleXIcon />
      <AlertTitle>Couldn't load the Bulletin</AlertTitle>
      <AlertDescription>
        {message ??
          "Temple's Bulletin isn't responding. Try again in a minute."}
      </AlertDescription>
    </Alert>
  );
}
