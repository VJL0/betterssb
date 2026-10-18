import type { ReactNode } from "react";
import { Card } from "@workspace/ui/components/card";
import { CourseBadge } from "@workspace/ui/components/course-badge";
import { DayStrip } from "@workspace/ui/components/day-strip";
import { RmpBadge } from "@workspace/ui/components/rmp-badge";
import { RouteMap } from "@workspace/ui/components/route-map";
import { SampleDataBadge } from "@workspace/ui/components/sample-data-badge";
import { SeatMeter } from "@workspace/ui/components/seat-meter";
import { StatusBadge } from "@workspace/ui/components/status-badge";
import { WeekCalendar } from "@workspace/ui/components/week-calendar";
import { cn } from "@workspace/ui/lib/utils";
import {
  SAMPLE_COURSE,
  SAMPLE_QUEUE,
  SAMPLE_TERMS,
  SAMPLE_WEEK,
} from "./sample-data";

interface PreviewFrameProps {
  /** What the picture shows, for screen readers. */
  label: string;
  children: ReactNode;
  className?: string;
}

/**
 * A picture of a feature built from the real components and sample data.
 * It's an illustration, so it's inert: nothing in it can be focused or clicked.
 */
export function PreviewFrame({
  label,
  children,
  className,
}: PreviewFrameProps) {
  return (
    <figure
      className={cn(
        "m-0 overflow-hidden rounded-3xl bg-background shadow-xl ring-1 ring-foreground/5",
        className,
      )}
    >
      <figcaption className="sr-only">{label}</figcaption>
      <div className="flex justify-end px-4 pt-3 sm:px-5">
        <SampleDataBadge />
      </div>
      <div inert className="px-4 pt-2 pb-4 sm:px-5 sm:pb-5">
        {children}
      </div>
    </figure>
  );
}

export function SearchPreview() {
  return (
    <div className="flex flex-col gap-3 text-left text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <CourseBadge code={SAMPLE_COURSE.code} />
        <span className="font-medium">{SAMPLE_COURSE.title}</span>
        <span className="text-muted-foreground">
          {SAMPLE_COURSE.credits} cr
        </span>
      </div>
      <ul className="flex flex-col divide-y divide-border">
        {SAMPLE_COURSE.sections.map((s) => (
          <li
            key={s.crn}
            className="grid grid-cols-1 gap-2 py-2.5 sm:grid-cols-[4rem_1fr_1fr_9rem] sm:items-center"
          >
            <span className="font-mono text-xs">
              {s.section}
              <span className="block text-muted-foreground">CRN {s.crn}</span>
            </span>
            <span className="flex items-center gap-2">
              <DayStrip days={s.days} />
              <span className="tabular-nums">{s.time}</span>
            </span>
            <span className="flex flex-wrap items-center gap-2">
              {s.instructor.professorName}
              <RmpBadge rating={s.instructor} />
            </span>
            <SeatMeter {...s.seats} size="sm" />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SchedulePreview() {
  return <WeekCalendar blocks={SAMPLE_WEEK} showGaps />;
}

export function PlannerPreview() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {SAMPLE_TERMS.map((term) => (
        <Card
          key={term.name}
          className="gap-3 rounded-2xl p-4"
          render={<section />}
        >
          <h4 className="flex justify-between font-medium">
            {term.name}
            <span className="text-muted-foreground tabular-nums">
              {term.courses.reduce((sum, c) => sum + c.credits, 0)} cr
            </span>
          </h4>
          <ul className="flex flex-col gap-2">
            {term.courses.map((c) => (
              <li key={c.code} className="flex items-center justify-between">
                <CourseBadge code={c.code} color={c.color} />
                <span className="text-muted-foreground tabular-nums">
                  {c.credits} cr
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}

export function AuditPreview() {
  return (
    <RouteMap
      aria-label="Sample requirements"
      items={[
        {
          id: "1",
          title: "CIS 1051 · Intro to Problem Solving",
          status: "complete",
          meta: "4/4",
        },
        {
          id: "2",
          title: "CIS 1068 · Program Design",
          status: "in_progress",
          meta: "0/4",
        },
        {
          id: "3",
          title: "CIS 2168 · Data Structures",
          status: "incomplete",
          note: "Needs CIS 1068",
          meta: "0/4",
          details: <StatusBadge tone="info">Spring plan</StatusBadge>,
        },
        {
          id: "4",
          title: "Lab science sequence",
          status: "incomplete",
          meta: "0/8",
        },
      ]}
    />
  );
}

export function RegisterPreview() {
  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex flex-col gap-1 rounded-2xl bg-primary p-4 text-primary-foreground">
        <span className="text-xs font-medium">
          Armed · submits Nov 14 at 7:00:00 AM
        </span>
        <span className="text-3xl font-medium tabular-nums">28d 14h 06m</span>
      </div>
      <ol className="flex flex-col divide-y divide-border">
        {SAMPLE_QUEUE.map((q, i) => (
          <li key={q.crn} className="flex items-center gap-3 py-2">
            <span className="w-4 text-muted-foreground tabular-nums">
              {i + 1}
            </span>
            <CourseBadge code={q.code} color={q.color} />
            <span>{q.section}</span>
            <span className="ml-auto font-mono text-xs">CRN {q.crn}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function AdvisorPreview() {
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="ml-auto max-w-[80%] rounded-2xl bg-primary px-3 py-2 text-primary-foreground">
        Which CIS electives fit a machine learning focus?
      </p>
      <p className="max-w-[85%] rounded-2xl bg-muted px-3 py-2">
        Your audit shows three CIS electives at 3000 or above still needed.
        Principles of Data Science is the usual starting point; check its
        prerequisites against your plan before adding it.
      </p>
    </div>
  );
}

export function BannerPreview() {
  const [first, second] = SAMPLE_COURSE.sections;
  return (
    <div className="overflow-x-auto text-sm">
      <table className="w-full min-w-[520px] text-left">
        <thead className="text-xs text-muted-foreground">
          <tr>
            <th className="py-2 font-medium">Course</th>
            <th className="py-2 font-medium">CRN</th>
            <th className="py-2 font-medium">Instructor</th>
            <th className="w-40 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {[first, second].map(
            (s) =>
              s && (
                <tr key={s.crn}>
                  <td className="py-2">
                    {SAMPLE_COURSE.code} · {s.section}
                  </td>
                  <td className="py-2 font-mono text-xs">{s.crn}</td>
                  <td className="py-2">
                    <span className="flex flex-wrap items-center gap-2">
                      {s.instructor.professorName}
                      <RmpBadge rating={s.instructor} />
                    </span>
                  </td>
                  <td className="py-2">
                    <SeatMeter {...s.seats} size="sm" />
                  </td>
                </tr>
              ),
          )}
        </tbody>
      </table>
    </div>
  );
}
