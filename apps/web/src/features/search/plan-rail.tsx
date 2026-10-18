import { CalendarDaysIcon, XIcon } from "lucide-react";
import {
  DAY_NAMES,
  formatTimeRange,
  type WeekDay,
} from "@workspace/shared/lib/meeting-times";
import {
  planConflicts,
  planCourseColor,
  planCredits,
} from "@workspace/shared/lib/plan";
import type { PlannedSection, TermPlan } from "@workspace/shared/types/store";
import { Button } from "@workspace/ui/components/button";
import { CourseDot } from "@workspace/ui/components/course-badge";
import { StatusBadge } from "@workspace/ui/components/status-badge";
import { WeekCalendar } from "@workspace/ui/components/week-calendar";
import { isPageReady } from "@/app/pages";
import { ButtonLink } from "@/components/button-link";
import { sectionBlocks, unscheduledSections } from "@/lib/plan-blocks";

const MINI_PIXELS_PER_HOUR = 22;

interface PlanRailProps {
  plan: TermPlan;
  termName: string;
  /** A section being hovered in the results, drawn dashed. */
  preview: PlannedSection | null;
  onRemove: (section: PlannedSection) => void;
}

function meetingSummary(section: PlannedSection): string {
  const timed = section.meetings.filter((m) => m.start !== null && m.days);
  if (timed.length === 0) return "No set time";
  return timed
    .map((m) => `${m.days} ${formatTimeRange(m.start!, m.end!)}`)
    .join(" · ");
}

/** The term's plan beside search results (DS3: mini-week, conflicts, next step). */
export function PlanRail({ plan, termName, preview, onRemove }: PlanRailProps) {
  const credits = planCredits(plan);
  const conflicts = planConflicts(plan.sections);
  const blocks = [
    ...sectionBlocks(plan.sections, plan),
    ...(preview && !plan.sections.some((s) => s.crn === preview.crn)
      ? sectionBlocks([preview], plan, { ghost: true })
      : []),
  ];
  const scheduleReady = isPageReady("schedule");

  return (
    <section
      aria-labelledby="plan-rail-heading"
      className="flex flex-col gap-4 rounded-3xl bg-card p-4 shadow-sm ring-1 ring-foreground/5"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="plan-rail-heading" className="font-medium">
          {termName} plan
        </h2>
        <span className="text-muted-foreground tabular-nums">{credits} cr</span>
      </div>

      {plan.sections.length === 0 && !preview ? (
        <p className="flex items-center gap-2 text-muted-foreground">
          <CalendarDaysIcon aria-hidden className="size-4 shrink-0" />
          Add sections with + to start your plan.
        </p>
      ) : (
        <WeekCalendar
          aria-label={`${termName} plan week`}
          blocks={blocks}
          unscheduled={unscheduledSections(plan.sections)}
          pixelsPerHour={MINI_PIXELS_PER_HOUR}
          compact
          showGaps={false}
        />
      )}

      {conflicts.length > 0 && (
        <ul className="flex flex-col gap-1.5" aria-label="Conflicts">
          {conflicts.map((c) => (
            <li key={`${c.a.crn}-${c.b.crn}`}>
              <StatusBadge
                tone="destructive"
                className="h-auto min-h-5 whitespace-normal"
              >
                {c.a.courseCode} · {c.a.section} overlaps {c.b.courseCode} ·{" "}
                {c.b.section}, {DAY_NAMES[c.day as WeekDay].slice(0, 3)}{" "}
                {formatTimeRange(c.start, c.end)}
              </StatusBadge>
            </li>
          ))}
        </ul>
      )}

      {plan.sections.length > 0 && (
        <ul className="flex flex-col divide-y divide-border">
          {plan.sections.map((section) => {
            const color = planCourseColor(plan, section.courseId);
            return (
              <li key={section.crn} className="flex items-center gap-2.5 py-2">
                {color && <CourseDot color={color} />}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-medium">
                    {section.courseCode} · {section.section}
                  </span>
                  <span className="truncate text-xs text-muted-foreground tabular-nums">
                    {meetingSummary(section)}
                  </span>
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${section.courseCode} · ${section.section} from your plan`}
                  onClick={() => onRemove(section)}
                >
                  <XIcon />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {scheduleReady && plan.sections.length > 0 && (
        <ButtonLink to="/schedule" variant="outline" className="w-full">
          Build schedules
        </ButtonLink>
      )}
    </section>
  );
}
