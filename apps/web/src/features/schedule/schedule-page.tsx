"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarDaysIcon,
  CalendarPlusIcon,
  CheckIcon,
  CircleXIcon,
  SearchIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { toast } from "sonner";
import { buildIcs } from "@workspace/shared/lib/ics";
import { DAY_NAMES, WEEKDAYS } from "@workspace/shared/lib/meeting-times";
import {
  planCourseColor,
  planCredits,
  plannedSectionFrom,
} from "@workspace/shared/lib/plan";
import { primaryInstructorName } from "@workspace/shared/lib/sections";
import type { PlannedSection } from "@workspace/shared/types/store";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert";
import { Card } from "@workspace/ui/components/card";
import { Button } from "@workspace/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Spinner } from "@workspace/ui/components/spinner";
import { cn } from "@workspace/ui/lib/utils";
import { ButtonLink } from "@/components/button-link";
import { useCurrentTerm } from "@/hooks/use-current-term";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { usePlan } from "@/hooks/use-plan";
import { useRatings } from "@/hooks/use-ratings";
import type { Term } from "@/hooks/use-terms";
import { downloadFile } from "@/lib/download";
import { formatClockTime } from "@/lib/relative-time";
import { undoToast } from "@/lib/undo-toast";
import { ScheduleOptionList } from "./schedule-option-list";
import {
  DEFAULT_RULES,
  buildOptions,
  calendarMeetings,
  combinationCount,
  dayToAllow,
  placeCourses,
  planCourses,
  type Placement,
  type ScheduleRules,
} from "./schedule-options";
import { ScheduleRulesCard } from "./schedule-rules";
import { ScheduleSectionsTable } from "./schedule-sections-table";
import { SelectedSchedule, type ScheduleView } from "./selected-schedule";
import { useCourseSections } from "./use-course-sections";
import {
  MAX_SCHEDULES,
  useGeneratedSchedules,
  type GeneratedSchedules,
} from "./use-generated-schedules";
import type { ClassSection } from "@workspace/api-client";

const ELAPSED_TICK_MS = 100;
const MS_PER_SECOND = 1000;

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** W2.2 · Schedule builder: every conflict-free week for the plan's courses. */
export function SchedulePage() {
  const { term, status } = useCurrentTerm();
  return (
    <div className="mx-auto flex max-w-[90rem] flex-col gap-5 px-4 pt-6 pb-16 text-sm sm:px-8">
      {status === "error" ? (
        <>
          <PageHeading subtitle="Banner terms didn't load" />
          <Alert variant="destructive">
            <CircleXIcon />
            <AlertTitle>Couldn't load terms from Banner</AlertTitle>
            <AlertDescription>Reload the page to try again.</AlertDescription>
          </Alert>
        </>
      ) : term ? (
        <ScheduleBuilder term={term} />
      ) : (
        <>
          <PageHeading subtitle="Loading terms…" />
          <Skeleton className="h-96 rounded-3xl" />
        </>
      )}
    </div>
  );
}

function PageHeading({
  subtitle,
  children,
}: {
  subtitle: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Schedule builder
        </h1>
        <p className="text-muted-foreground tabular-nums">{subtitle}</p>
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

function sameCrns(
  a: readonly PlannedSection[],
  b: readonly PlannedSection[],
): boolean {
  const crns = new Set(a.map((s) => s.crn));
  return a.length === b.length && b.every((s) => crns.has(s.crn));
}

function ScheduleBuilder({ term }: { term: Term }) {
  const planState = usePlan(term.code, term.name);
  const { plan } = planState;
  const courses = useMemo(() => planCourses(plan), [plan]);
  const loaded = useCourseSections(term.code, courses);
  const [rules, setRules] = useState<ScheduleRules>(DEFAULT_RULES);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<ScheduleView>("week");

  const ready = loaded.status === "ready";
  const placement = useMemo(
    () => placeCourses(courses, loaded.sectionsByCourse, rules, ready),
    [courses, loaded.sectionsByCourse, rules, ready],
  );
  const { meetings } = placement;
  const generated = useGeneratedSchedules(meetings, placement.widened);

  const allSections = useMemo(
    () => [...loaded.sectionsByCourse.values()].flat(),
    [loaded.sectionsByCourse],
  );
  const sectionsByCrn = useMemo(
    () => new Map(allSections.map((s) => [s.courseReferenceNumber, s])),
    [allSections],
  );
  const ratings = useRatings(allSections.map(primaryInstructorName));

  const stale = generated.status === "error";
  const options = useMemo(
    () =>
      buildOptions(
        stale ? (generated.last?.schedules ?? []) : generated.schedules,
        sectionsByCrn,
        ratings,
        rules.rankBy,
      ),
    [
      stale,
      generated.last,
      generated.schedules,
      sectionsByCrn,
      ratings,
      rules.rankBy,
    ],
  );
  const current = options.find((o) => o.id === selectedId) ?? options[0];
  const index = current ? options.indexOf(current) : -1;

  function step(by: number) {
    if (options.length === 0) return;
    const next = options[(index + by + options.length) % options.length]!;
    setSelectedId(next.id);
  }
  useKeyboardShortcuts({ "[": () => step(-1), "]": () => step(1) });

  const colorFor = (courseId: string) => planCourseColor(plan, courseId);
  const subtitle = `${plural(courses.length, "course")} from your ${term.name} plan`;

  if (planState.status === "loading") {
    return (
      <>
        <PageHeading subtitle={`Loading your ${term.name} plan…`} />
        <Skeleton className="h-96 rounded-3xl" />
      </>
    );
  }

  if (courses.length === 0) {
    return (
      <>
        <PageHeading subtitle={`Nothing in your ${term.name} plan yet`} />
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CalendarDaysIcon />
            </EmptyMedia>
            <EmptyTitle>Add courses to build a schedule</EmptyTitle>
            <EmptyDescription>
              Add a section of each course you want to take in {term.name}. The
              builder then tries every section of those courses and shows the
              weeks that fit together.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <ButtonLink href="/search">
              <SearchIcon data-icon="inline-start" />
              Search courses
            </ButtonLink>
          </EmptyContent>
        </Empty>
      </>
    );
  }

  const selectedSections: ClassSection[] = current
    ? current.crns.flatMap((crn) => sectionsByCrn.get(crn) ?? [])
    : [];
  const now = new Date().toISOString();
  const scheduled = selectedSections.map((s) => plannedSectionFrom(s, now));
  const scheduledCourses = new Set(scheduled.map((s) => s.courseId));
  // Sections of courses the builder couldn't place (online ones) stay planned.
  const keptSections = plan.sections.filter(
    (s) => !scheduledCourses.has(s.courseId),
  );
  const nextSections = [...scheduled, ...keptSections];
  const saved = !!current && sameCrns(plan.sections, nextSections);

  async function save() {
    const before = plan;
    try {
      await planState.replaceSections(nextSections);
      undoToast(
        `Saved schedule ${index + 1} to your ${term.name} plan`,
        () => void planState.restore(before),
      );
    } catch {
      toast.error("Couldn't save your plan. Try again.");
    }
  }

  function exportCalendar() {
    const events = calendarMeetings(selectedSections);
    if (events.length === 0) {
      toast.error(
        "Banner hasn't posted class dates for these sections, so there's nothing to export yet.",
      );
      return;
    }
    const { ics } = buildIcs(events);
    downloadFile(
      ics,
      `betterssb-${term.code}-schedule-${index + 1}.ics`,
      "text/calendar",
    );
    toast.success(`Downloaded schedule ${index + 1} as a calendar file`);
  }

  return (
    <>
      <PageHeading
        subtitle={`${subtitle} · ${foundText(generated, options.length, loaded.status)}`}
      >
        <Button
          variant="outline"
          onClick={exportCalendar}
          disabled={!current || stale}
        >
          <CalendarPlusIcon data-icon="inline-start" />
          Export .ics
        </Button>
        {/* Stays focusable once saved, so focus isn't lost from under the keyboard. */}
        <Button
          onClick={() => void save()}
          disabled={!current || saved || stale}
          focusableWhenDisabled
        >
          {saved && <CheckIcon data-icon="inline-start" />}
          {saved ? "Saved to plan" : "Save to plan"}
        </Button>
      </PageHeading>

      {loaded.status === "ready" && loaded.failed.length > 0 && (
        <Alert variant="warning">
          <TriangleAlertIcon />
          <AlertTitle>
            Couldn't load sections for{" "}
            {loaded.failed.map((c) => c.code).join(", ")}
          </AlertTitle>
          <AlertDescription>
            Schedules below leave {loaded.failed.length === 1 ? "it" : "them"}{" "}
            out.
          </AlertDescription>
          <AlertAction>
            <Button variant="outline" size="sm" onClick={loaded.retry}>
              Try again
            </Button>
          </AlertAction>
        </Alert>
      )}

      {/* Below lg the chosen week comes right after the rules and the list
          follows it; from lg the list sits under the rules. */}
      <div className="grid items-start gap-6 lg:grid-cols-[17rem_minmax(0,1fr)] lg:grid-rows-[auto_1fr]">
        <div className="min-w-0 lg:col-start-1 lg:row-start-1">
          <ScheduleRulesCard
            rules={rules}
            onChange={setRules}
            courses={courses}
            colorFor={colorFor}
            notes={placement.notes}
          />
        </div>

        <section
          aria-label="Selected schedule"
          className="flex min-w-0 flex-col gap-4 lg:col-start-2 lg:row-span-2 lg:row-start-1"
        >
          <MainState
            term={term}
            loaded={loaded}
            generated={generated}
            placement={placement}
            rules={rules}
            onRules={setRules}
            hasOptions={options.length > 0}
          />
          {current && (
            <div className={cn("flex flex-col gap-4", stale && "opacity-60")}>
              <SelectedSchedule
                option={current}
                index={index}
                options={options}
                sections={scheduled}
                unplacedSections={keptSections}
                credits={planCredits({
                  ...plan,
                  sections: scheduled,
                  courses: [],
                })}
                plan={plan}
                view={view}
                onView={setView}
                onPrevious={() => step(-1)}
                onNext={() => step(1)}
                onSelect={setSelectedId}
                ratingFor={(s) => {
                  const rating = ratings.get(s.instructor);
                  return rating === undefined
                    ? undefined
                    : (rating?.overallRating ?? null);
                }}
              />
              <ScheduleSectionsTable
                heading={`Sections in schedule ${index + 1}`}
                sections={selectedSections}
                plan={plan}
                ratings={ratings}
              />
            </div>
          )}
        </section>

        <div className="min-w-0 lg:col-start-1 lg:row-start-2">
          {options.length > 0 && current && (
            <ScheduleOptionList
              options={options}
              selectedId={current.id}
              onSelect={setSelectedId}
              colorFor={colorFor}
              stale={stale}
            />
          )}
        </div>
      </div>
    </>
  );
}

function foundText(
  generated: GeneratedSchedules,
  found: number,
  loadStatus: string,
): string {
  if (loadStatus === "loading") return "loading sections";
  if (generated.status === "loading") return "building schedules";
  if (generated.status !== "ready") return "no schedules yet";
  if (found >= MAX_SCHEDULES) return `the best ${MAX_SCHEDULES} schedules`;
  return `${plural(found, "schedule")} fit your rules`;
}

interface MainStateProps {
  term: Term;
  loaded: ReturnType<typeof useCourseSections>;
  generated: GeneratedSchedules;
  placement: Placement;
  rules: ScheduleRules;
  onRules: (rules: ScheduleRules) => void;
  hasOptions: boolean;
}

/** Whatever stands in for, or sits above, the chosen schedule. */
function MainState({
  term,
  loaded,
  generated,
  placement,
  rules,
  onRules,
  hasOptions,
}: MainStateProps) {
  if (loaded.status === "loading") {
    return (
      <div role="status" className="flex flex-col gap-4">
        <span className="sr-only">Loading sections from Banner…</span>
        <Skeleton className="h-24 rounded-3xl" />
        <Skeleton className="h-[30rem] rounded-3xl" />
      </div>
    );
  }

  if (loaded.status === "error") {
    return (
      <Alert variant="destructive">
        <CircleXIcon />
        <AlertTitle>Couldn't load sections from Banner</AlertTitle>
        <AlertDescription>
          Banner's class search didn't answer for {term.name}. Your plan is safe
          on this device.
        </AlertDescription>
        <AlertAction>
          <Button variant="outline" size="sm" onClick={loaded.retry}>
            Try again
          </Button>
        </AlertAction>
      </Alert>
    );
  }

  if (placement.nothingToPlace) {
    const timesSet = rules.startAfter !== null || rules.endBefore !== null;
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CalendarDaysIcon />
          </EmptyMedia>
          <EmptyTitle>No sections to place on a week</EmptyTitle>
          <EmptyDescription>
            {timesSet
              ? "No section of your courses meets within these times."
              : "Your courses only have online sections or sections without a set time in Banner."}
          </EmptyDescription>
        </EmptyHeader>
        {timesSet && (
          <EmptyContent>
            <Button
              variant="outline"
              onClick={() =>
                onRules({ ...DEFAULT_RULES, rankBy: rules.rankBy })
              }
            >
              Reset rules
            </Button>
          </EmptyContent>
        )}
      </Empty>
    );
  }

  switch (generated.status) {
    case "loading":
      return (
        <Generating
          key={generated.runKey}
          combinations={combinationCount(placement.meetings)}
          onCancel={generated.cancel}
        />
      );
    case "cancelled":
      return (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyTitle>Stopped building schedules</EmptyTitle>
            <EmptyDescription>
              Change a rule to try fewer combinations, or start again.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" onClick={generated.retry}>
              Try again
            </Button>
          </EmptyContent>
        </Empty>
      );
    case "error":
      return (
        <Alert variant="destructive">
          <CircleXIcon />
          <AlertTitle>Couldn't generate schedules</AlertTitle>
          <AlertDescription>
            The schedule service didn't answer.
            {generated.last &&
              ` Your last ${plural(generated.last.schedules.length, "schedule")} from ${formatClockTime(generated.last.at)} are kept below.`}
          </AlertDescription>
          <AlertAction>
            <Button variant="outline" size="sm" onClick={generated.retry}>
              Try again
            </Button>
          </AlertAction>
        </Alert>
      );
    case "ready":
      return hasOptions ? null : (
        <NoFit widened={generated.widened} rules={rules} onRules={onRules} />
      );
    default:
      return null;
  }
}

function Generating({
  combinations,
  onCancel,
}: {
  combinations: number;
  onCancel: () => void;
}) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(
      () => setElapsed(Date.now() - started),
      ELAPSED_TICK_MS,
    );
    return () => clearInterval(timer);
  }, []);

  return (
    <Card className="flex-row items-center gap-3 p-4">
      <Spinner aria-hidden />
      <span role="status" className="flex-1">
        Trying {combinations.toLocaleString()}{" "}
        {combinations === 1 ? "combination" : "combinations"}…
      </span>
      <span aria-hidden className="text-muted-foreground tabular-nums">
        {(elapsed / MS_PER_SECOND).toFixed(1)} s
      </span>
      <Button variant="outline" size="sm" onClick={onCancel}>
        Cancel
      </Button>
    </Card>
  );
}

function NoFit({
  widened,
  rules,
  onRules,
}: {
  widened: GeneratedSchedules["widened"];
  rules: ScheduleRules;
  onRules: (rules: ScheduleRules) => void;
}) {
  const suggestion = dayToAllow(widened, rules.days);
  const dayName = suggestion ? DAY_NAMES[suggestion.day] : "";
  const count = suggestion
    ? suggestion.schedules >= MAX_SCHEDULES
      ? `at least ${MAX_SCHEDULES} schedules`
      : plural(suggestion.schedules, "schedule")
    : "";

  return (
    <Empty className="border border-dashed">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <CalendarDaysIcon />
        </EmptyMedia>
        <EmptyTitle>No conflict-free schedule</EmptyTitle>
        <EmptyDescription>
          {suggestion
            ? `Your courses don't fit together on the days you kept. Allowing ${dayName}s gives ${count}.`
            : "Every combination of these sections overlaps somewhere. Try other sections, or loosen the time rules."}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="flex-row flex-wrap justify-center">
        {suggestion && (
          <Button
            onClick={() =>
              onRules({
                ...rules,
                days: WEEKDAYS.filter(
                  (d) => rules.days.includes(d) || d === suggestion.day,
                ),
              })
            }
          >
            Allow {dayName}s
          </Button>
        )}
        <ButtonLink href="/search" variant="outline">
          Find other sections
        </ButtonLink>
      </EmptyContent>
    </Empty>
  );
}
