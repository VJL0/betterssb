import { useEffect, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import {
  CheckIcon,
  ExternalLinkIcon,
  PlusIcon,
  SearchIcon,
} from "lucide-react";
import {
  queryError,
  type ClassSection,
  type RmpRating,
} from "@workspace/api-client";
import {
  listSubjectsOptions,
  searchProfessorsOptions,
  searchSectionsOptions,
} from "@workspace/api-client/query";
import { parseClassQuery } from "@workspace/shared/lib/class-query";
import {
  instructorSearchName,
  matchingProfile,
  shortInstructorName,
} from "@workspace/shared/lib/instructors";
import {
  formatTimeRange,
  parseClockTime,
} from "@workspace/shared/lib/meeting-times";
import {
  addSection,
  courseCode,
  emptyPlan,
  plannedSectionFrom,
  planCourseColor,
  removeSection,
} from "@workspace/shared/lib/plan";
import { usableRating } from "@workspace/shared/lib/ratings";
import {
  meetingTimeToDays,
  primaryInstructorName,
} from "@workspace/shared/lib/sections";
import { planKey } from "@workspace/shared/lib/store";
import { Card } from "@workspace/ui/components/card";
import { Button } from "@workspace/ui/components/button";
import { CourseBadge } from "@workspace/ui/components/course-badge";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@workspace/ui/components/input-group";
import { RmpBadge } from "@workspace/ui/components/rmp-badge";
import { SeatMeter } from "@workspace/ui/components/seat-meter";
import { Skeleton } from "@workspace/ui/components/skeleton";
import type { Term } from "../hooks/use-current-term";
import { useStoreDocument } from "@/hooks/use-store-document";
import { openWeb } from "../lib/open-web";

/** Each search opens a Banner session, so wait for typing to pause. */
const TYPING_PAUSE_MS = 500;
/** The popup shows the first results; the website pages through the rest. */
const POPUP_RESULTS = 25;
const SUBJECTS_STALE_MS = 24 * 60 * 60 * 1000;

function meets(section: ClassSection): string {
  const timed = section.meetingsFaculty.find(
    ({ meetingTime: mt }) => mt.beginTime && mt.endTime,
  )?.meetingTime;
  if (!timed) return "No set time";
  return `${meetingTimeToDays(timed)} ${formatTimeRange(
    parseClockTime(timed.beginTime!),
    parseClockTime(timed.endTime!),
  )}`;
}

function useSettled(value: string): string {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), TYPING_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [value]);
  return settled;
}

/** E1.3 Search: quick section lookup with ratings, seats and add to plan. */
export function SearchTab({ term }: { term: Term }) {
  const [input, setInput] = useState("");
  const settled = useSettled(input);
  const subjects = useQuery({
    ...listSubjectsOptions({ query: { term: term.code } }),
    staleTime: SUBJECTS_STALE_MS,
    select: (list) => new Set(list.map((s) => s.code.toUpperCase())),
  });
  const query = parseClassQuery(settled, subjects.data ?? new Set());
  const filters =
    query.kind === "course"
      ? { subject: query.subject, courseNumber: query.courseNumber }
      : query.kind === "subject"
        ? { subject: query.subject }
        : query.kind === "keyword"
          ? { keyword: query.keyword }
          : null;
  const search = useQuery({
    ...searchSectionsOptions({
      query: { term: term.code, limit: POPUP_RESULTS, ...filters },
      meta: { errorMessage: "Couldn't search Banner's classes." },
    }),
    enabled: filters !== null && (subjects.isSuccess || subjects.isError),
  });

  const doc = useStoreDocument(planKey(term.code));
  const plan = doc.value ?? emptyPlan(term.code, term.name);
  const planned = new Set(plan.sections.map((s) => s.crn));
  const sections = search.data?.sections ?? [];
  const names = [...new Set(sections.map(primaryInstructorName))].filter(
    (n) => n !== "TBA",
  );
  const ratings = useQueries({
    queries: names.map((name) => ({
      ...searchProfessorsOptions({
        query: { name: instructorSearchName(name) },
      }),
      staleTime: Infinity,
      retry: false,
      select: (matches: RmpRating[]) =>
        usableRating(matchingProfile(name, matches)),
    })),
    combine: (results) => new Map(names.map((name, i) => [name, results[i]])),
  });

  function toggle(section: ClassSection) {
    const now = new Date().toISOString();
    void doc.save(
      planned.has(section.courseReferenceNumber)
        ? removeSection(plan, section.courseReferenceNumber, now)
        : addSection(plan, plannedSectionFrom(section, now), now),
    );
  }

  const groups = new Map<string, ClassSection[]>();
  for (const s of sections) {
    groups.set(s.subjectCourse, [...(groups.get(s.subjectCourse) ?? []), s]);
  }

  return (
    <div className="flex flex-col gap-3">
      <form role="search" onSubmit={(e) => e.preventDefault()}>
        <InputGroup>
          <InputGroupAddon>
            <SearchIcon aria-hidden />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            aria-label="Search sections"
            placeholder="Course, subject or keyword"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            autoFocus
          />
        </InputGroup>
      </form>

      {filters === null ? (
        <p className="px-1 text-muted-foreground">
          {query.kind === "crn"
            ? "Banner's public search can't look up a CRN. Try a course like CIS 2168."
            : `Search ${term.name} by course (CIS 2168), subject (MATH) or keyword.`}
        </p>
      ) : search.isPending ? (
        <div role="status" className="flex flex-col gap-2">
          <span className="sr-only">Searching…</span>
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
        </div>
      ) : search.isError ? (
        <Card className="gap-0 rounded-2xl p-3 text-destructive" render={<p />}>
          {queryError(search.error)?.message}
        </Card>
      ) : sections.length === 0 ? (
        <Card className="items-start gap-2 rounded-2xl p-4">
          <p className="font-medium">Nothing matches “{settled.trim()}”</p>
          <p className="text-muted-foreground">
            Try a course code like CIS 2168, or open full search.
          </p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-2" aria-label="Results">
          {[...groups].map(([courseId, list]) => (
            <Card
              key={courseId}
              className="gap-0 rounded-2xl p-3"
              render={<li />}
            >
              <h2 className="mb-1 flex items-center gap-2">
                <CourseBadge
                  code={courseCode(list[0]!.subject, list[0]!.courseNumber)}
                  color={planCourseColor(plan, courseId)}
                />
                <span className="truncate font-medium">
                  {list[0]!.courseTitle}
                </span>
              </h2>
              <ul className="flex flex-col divide-y">
                {list.map((section) => {
                  const name = primaryInstructorName(section);
                  const rating = ratings.get(name);
                  const on = planned.has(section.courseReferenceNumber);
                  const label = `${courseCode(section.subject, section.courseNumber)} ${section.sequenceNumber}`;
                  return (
                    <li
                      key={section.courseReferenceNumber}
                      className="flex items-center gap-2 py-2"
                    >
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="text-xs tabular-nums">
                          {section.sequenceNumber} · {meets(section)}
                        </span>
                        <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          <span title={name}>{shortInstructorName(name)}</span>
                          {name !== "TBA" &&
                            (rating?.isPending ? (
                              <Skeleton className="h-5 w-16 rounded-2xl" />
                            ) : (
                              <RmpBadge
                                rating={rating?.data ?? null}
                                instructorName={name}
                              />
                            ))}
                        </span>
                      </span>
                      <span className="w-20 shrink-0">
                        <SeatMeter {...section} size="sm" />
                      </span>
                      <Button
                        variant={on ? "default" : "outline"}
                        size="icon-sm"
                        aria-pressed={on}
                        aria-label={
                          on
                            ? `In plan. Remove ${label}`
                            : `Add ${label} to plan`
                        }
                        onClick={() => toggle(section)}
                      >
                        {on ? <CheckIcon /> : <PlusIcon />}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ))}
        </ul>
      )}

      <Button
        variant="link"
        size="sm"
        className="self-start px-0"
        onClick={() =>
          void openWeb(
            settled.trim()
              ? `/search?q=${encodeURIComponent(settled.trim())}`
              : "/search",
          )
        }
      >
        Open full search
        <ExternalLinkIcon data-icon="inline-end" />
      </Button>
    </div>
  );
}
