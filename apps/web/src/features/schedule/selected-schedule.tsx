import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import {
  DAY_NAMES,
  WEEKDAYS,
  formatDuration,
  formatTimeOfDay,
  formatTimeRange,
  parseDays,
} from "@workspace/shared/lib/meeting-times";
import { formatRating } from "@workspace/shared/lib/ratings";
import type { PlannedSection, TermPlan } from "@workspace/shared/types/store";
import { Card } from "@workspace/ui/components/card";
import { Button } from "@workspace/ui/components/button";
import { CourseBadge } from "@workspace/ui/components/course-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs";
import { DayAgenda } from "@workspace/ui/components/day-agenda";
import { WeekCalendar } from "@workspace/ui/components/week-calendar";
import { cn } from "@workspace/ui/lib/utils";
import { planCourseColor } from "@workspace/shared/lib/plan";
import { sectionBlocks, unscheduledSections } from "@/lib/plan-blocks";
import type { ScheduleOption } from "./schedule-options";

/** How many schedules the Compare tab sets side by side. */
const COMPARE_COUNT = 3;

export type ScheduleView = "week" | "list" | "compare";

interface SelectedScheduleProps {
  option: ScheduleOption;
  /** Its place in the ranked list, from 0. */
  index: number;
  options: readonly ScheduleOption[];
  /** The option's sections, as the plan would keep them. */
  sections: readonly PlannedSection[];
  /** Planned sections the generator couldn't place (online, no set time). */
  unplacedSections: readonly PlannedSection[];
  credits: number;
  plan: TermPlan;
  view: ScheduleView;
  onView: (view: ScheduleView) => void;
  onPrevious: () => void;
  onNext: () => void;
  onSelect: (id: string) => void;
  ratingFor: (section: PlannedSection) => number | null | undefined;
}

function statsFor(option: ScheduleOption, credits?: number) {
  const { stats } = option;
  return [
    ...(credits === undefined ? [] : [{ label: "Credits", value: credits }]),
    { label: "Days on campus", value: stats.daysOnCampus.length },
    {
      label: "Earliest start",
      value:
        stats.earliestStart === null
          ? "—"
          : formatTimeOfDay(stats.earliestStart),
    },
    {
      label: "Time between classes",
      value: formatDuration(stats.minutesBetweenClasses),
    },
    {
      label: "Avg instructor",
      value:
        option.averageRating === null
          ? "—"
          : formatRating(option.averageRating),
    },
  ];
}

/** The chosen schedule: a week, a day-by-day list, or a side-by-side comparison. */
export function SelectedSchedule({
  option,
  index,
  options,
  sections,
  unplacedSections,
  credits,
  plan,
  view,
  onView,
  onPrevious,
  onNext,
  onSelect,
  ratingFor,
}: SelectedScheduleProps) {
  const count = options.length;
  const unscheduled = unscheduledSections(unplacedSections);
  const blocks = sectionBlocks(sections, plan, { ratingFor });

  return (
    <Card className="gap-4 px-5 pt-4 pb-5">
      <Tabs
        value={view}
        onValueChange={(value) => onView(value as ScheduleView)}
        className="gap-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Previous schedule"
              onClick={onPrevious}
              disabled={count < 2}
            >
              <ChevronLeftIcon />
            </Button>
            <h2
              className="text-base font-medium tabular-nums"
              aria-live="polite"
            >
              Schedule {index + 1} of {count}
            </h2>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Next schedule"
              onClick={onNext}
              disabled={count < 2}
            >
              <ChevronRightIcon />
            </Button>
          </div>
          <TabsList aria-label="View">
            <TabsTrigger value="week">Week</TabsTrigger>
            <TabsTrigger value="list">List</TabsTrigger>
            <TabsTrigger value="compare">Compare</TabsTrigger>
          </TabsList>
        </div>

        <dl className="grid grid-cols-[repeat(auto-fit,minmax(7.5rem,1fr))] gap-2">
          {statsFor(option, credits).map((stat) => (
            <div
              key={stat.label}
              className="rounded-2xl bg-sidebar px-3 py-2.5 ring-1 ring-border ring-inset"
            >
              <dt className="text-xs text-muted-foreground">{stat.label}</dt>
              <dd className="mt-0.5 text-lg font-medium tabular-nums">
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>

        <TabsContent value="week" className="flex flex-col gap-3">
          {/* Phones get one day at a time (W-Mobile); the week needs 640px. */}
          <DayAgenda className="sm:hidden" blocks={blocks} days={WEEKDAYS} />
          <WeekCalendar
            aria-label={`Schedule ${index + 1} week`}
            className="hidden sm:flex"
            blocks={blocks}
            unscheduled={unscheduled}
          />
          {unscheduled.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No online or unscheduled sections in this schedule.
            </p>
          )}
        </TabsContent>

        <TabsContent value="list">
          <DayList sections={sections} plan={plan} />
        </TabsContent>

        <TabsContent value="compare">
          <Compare
            options={options}
            selectedId={option.id}
            onSelect={onSelect}
          />
        </TabsContent>
      </Tabs>
    </Card>
  );
}

function DayList({
  sections,
  plan,
}: {
  sections: readonly PlannedSection[];
  plan: TermPlan;
}) {
  const days = WEEKDAYS.map((day) => ({
    day,
    meetings: sections
      .flatMap((section) =>
        section.meetings
          .filter(
            (m) =>
              m.start !== null &&
              m.end !== null &&
              parseDays(m.days).includes(day),
          )
          .map((m) => ({
            section,
            start: m.start!,
            end: m.end!,
            location: m.location,
          })),
      )
      .sort((a, b) => a.start - b.start),
  }));

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {days.map(({ day, meetings }) => (
        <section
          key={day}
          aria-label={DAY_NAMES[day]}
          className="flex flex-col gap-2"
        >
          <h3 className="font-medium">{DAY_NAMES[day]}</h3>
          {meetings.length === 0 ? (
            <p className="text-muted-foreground">No classes</p>
          ) : (
            <ol className="flex flex-col gap-2">
              {meetings.map(({ section, start, end, location }) => (
                <li
                  key={`${section.crn}-${start}`}
                  className="flex flex-col gap-1 rounded-2xl bg-sidebar px-3 py-2 ring-1 ring-border ring-inset"
                >
                  <span className="tabular-nums">
                    {formatTimeRange(start, end)}
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    <CourseBadge
                      code={section.courseCode}
                      color={planCourseColor(plan, section.courseId)}
                    />
                    <span className="text-muted-foreground">
                      {section.section} · {section.scheduleType}
                    </span>
                  </span>
                  {location && (
                    <span className="text-xs text-muted-foreground">
                      {location}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>
      ))}
    </div>
  );
}

function Compare({
  options,
  selectedId,
  onSelect,
}: {
  options: readonly ScheduleOption[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const selectedIndex = options.findIndex((o) => o.id === selectedId);
  const shown = options
    .map((option, index) => ({ option, index }))
    .filter(({ index }) => index < COMPARE_COUNT || index === selectedIndex);
  const rows = statsFor(shown[0]!.option).map((stat) => stat.label);

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">
              <span className="sr-only">Measure</span>
            </TableHead>
            {shown.map(({ option, index }) => (
              <TableHead
                key={option.id}
                scope="col"
                className={cn(option.id === selectedId && "text-foreground")}
              >
                <Button
                  variant={option.id === selectedId ? "secondary" : "ghost"}
                  size="sm"
                  aria-pressed={option.id === selectedId}
                  onClick={() => onSelect(option.id)}
                >
                  Schedule {index + 1}
                </Button>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {[...rows, "Score"].map((label, row) => (
            <TableRow key={label}>
              <TableHead
                scope="row"
                className="font-normal text-muted-foreground"
              >
                {label}
              </TableHead>
              {shown.map(({ option }) => (
                <TableCell key={option.id} className="tabular-nums">
                  {label === "Score"
                    ? Math.round(option.score)
                    : statsFor(option)[row]!.value}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
