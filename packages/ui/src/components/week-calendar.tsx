import { useId } from "react";
import type * as React from "react";
import { CircleXIcon, LockIcon } from "lucide-react";
import { cn } from "cn";
import type { CourseColor } from "@workspace/shared/lib/course-colors";
import {
  DAY_NAMES,
  MINUTES_PER_HOUR,
  WEEKDAYS,
  formatDuration,
  formatTimeRange,
  parseDays,
  type WeekDay,
} from "@workspace/shared/lib/meeting-times";
import { formatRating, ratingBand } from "@workspace/shared/lib/ratings";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip";
import {
  COURSE_HATCH_CLASS,
  courseBackgroundClass,
  courseColorVar,
} from "@workspace/ui/lib/course-color-classes";
import {
  hourRange,
  layoutDay,
  type PositionedMeeting,
  type TimeSpan,
} from "@workspace/ui/lib/week-layout";

const DEFAULT_PIXELS_PER_HOUR = 60;
/** Block text lines; a block shows as many as fit (heading, title, time, room). */
const LINE_HEIGHT_PX = 16;
const BLOCK_PADDING_Y_PX = 6;
/** Below this many days the grid can shrink to fit a phone. */
const MIN_DAYS_FOR_FIXED_WIDTH = 3;
const BLOCK_INSET_PX = 4;
const BLOCK_GAP_PX = 2;
const NOON_HOUR = 12;

export interface WeekCalendarBlock {
  id: string;
  /** Banner days string, e.g. "TR". */
  days: string;
  /** Minutes after midnight. */
  start: number;
  end: number;
  code: string;
  section: string;
  title: string;
  location?: string;
  /** Schedule type, e.g. "Lecture" or "Lab". */
  kind?: string;
  /** `tint` for labs and recitations: a light course tint with a course-colored ring. */
  appearance?: "solid" | "tint";
  /** Null for a course that isn't in the plan yet. */
  color: CourseColor | null;
  pinned?: boolean;
  /** A hover preview from search: dashed, never a conflict. */
  ghost?: boolean;
  /** The instructor's rating; a low one is flagged on the block. */
  rating?: number | null;
}

export interface UnscheduledSection {
  id: string;
  code: string;
  section: string;
  title: string;
  /** Why it has no time, e.g. "Online, no set meeting time". */
  note?: string;
}

interface WeekCalendarProps extends React.ComponentProps<"div"> {
  blocks: readonly WeekCalendarBlock[];
  /** Sections with no meeting time, listed in a tray under the grid. */
  unscheduled?: readonly UnscheduledSection[];
  /** Days to show. Defaults to Monday–Friday plus any weekend day in use. */
  days?: readonly WeekDay[];
  pixelsPerHour?: number;
  showGaps?: boolean;
}

function spokenRange(start: number, end: number): string {
  return formatTimeRange(start, end).replace("–", " to ");
}

function describeBlock(
  block: WeekCalendarBlock,
  conflict: TimeSpan | null,
): string {
  const parts = [
    `${block.code} ${block.section}`,
    block.title,
    block.kind,
    spokenRange(block.start, block.end),
    block.location,
  ];
  if (block.pinned) parts.push("pinned");
  if (block.ghost) parts.push("preview");
  if (conflict) {
    parts.push(
      `overlaps another class ${spokenRange(conflict.start, conflict.end)}`,
    );
  }
  return parts.filter(Boolean).join(", ");
}

function defaultDays(blocks: readonly WeekCalendarBlock[]): WeekDay[] {
  const weekend = new Set<WeekDay>();
  for (const b of blocks) {
    for (const d of parseDays(b.days)) {
      if (!WEEKDAYS.includes(d)) weekend.add(d);
    }
  }
  return [...WEEKDAYS, ...weekend];
}

/**
 * A week of classes in course colors. Overlapping classes split the column
 * and get a conflict ring; gaps of an hour or more are drawn between classes.
 * Screen readers get each day as a list of its classes.
 */
function WeekCalendar({
  blocks,
  unscheduled = [],
  days,
  pixelsPerHour = DEFAULT_PIXELS_PER_HOUR,
  showGaps = true,
  className,
  ...props
}: WeekCalendarProps) {
  const shownDays = days ?? defaultDays(blocks);
  const { startHour, endHour } = hourRange(blocks);
  const rangeStart = startHour * MINUTES_PER_HOUR;
  const height = (endHour - startHour) * pixelsPerHour;
  const toPx = (minutes: number) =>
    ((minutes - rangeStart) * pixelsPerHour) / MINUTES_PER_HOUR;
  const hours = Array.from(
    { length: endHour - startHour },
    (_, i) => startHour + i,
  );

  return (
    <div
      data-slot="week-calendar"
      className={cn("flex flex-col gap-3", className)}
      {...props}
    >
      <div className="overflow-x-auto">
        <div
          className={cn(
            "grid gap-x-1.5",
            shownDays.length >= MIN_DAYS_FOR_FIXED_WIDTH && "min-w-[640px]",
          )}
          style={{
            gridTemplateColumns: `52px repeat(${shownDays.length}, minmax(0, 1fr))`,
          }}
        >
          <span />
          {shownDays.map((day) => (
            <span
              key={day}
              aria-hidden
              className="pb-2 text-center text-sm font-medium"
            >
              {DAY_NAMES[day].slice(0, 3)}
            </span>
          ))}

          <div
            aria-hidden
            className="relative text-xs text-muted-foreground tabular-nums"
            style={{ height }}
          >
            {hours.map((hour, i) => (
              <span
                key={hour}
                className="absolute right-2 -translate-y-2"
                style={{ top: i * pixelsPerHour }}
              >
                {hourLabel(hour)}
              </span>
            ))}
          </div>

          {shownDays.map((day) => (
            <DayColumn
              key={day}
              day={day}
              blocks={blocks}
              height={height}
              pixelsPerHour={pixelsPerHour}
              toPx={toPx}
              showGaps={showGaps}
            />
          ))}
        </div>
      </div>

      {unscheduled.length > 0 && <UnscheduledTray sections={unscheduled} />}
    </div>
  );
}

function hourLabel(hour: number): string {
  return `${hour % NOON_HOUR || NOON_HOUR} ${hour >= NOON_HOUR ? "PM" : "AM"}`;
}

type DayItem =
  | { kind: "gap"; start: number; gap: TimeSpan }
  | {
      kind: "block";
      start: number;
      block: PositionedMeeting<WeekCalendarBlock>;
    };

interface DayColumnProps {
  day: WeekDay;
  blocks: readonly WeekCalendarBlock[];
  height: number;
  pixelsPerHour: number;
  toPx: (minutes: number) => number;
  showGaps: boolean;
}

/** Overlap spans on one day, merged so each clash gets one label. */
function mergedConflicts(
  meetings: readonly PositionedMeeting<WeekCalendarBlock>[],
): TimeSpan[] {
  const spans = meetings
    .map((p) => p.conflict)
    .filter((c): c is TimeSpan => c !== null)
    .sort((a, b) => a.start - b.start);
  const merged: TimeSpan[] = [];
  for (const span of spans) {
    const last = merged[merged.length - 1];
    if (last && span.start <= last.end) last.end = Math.max(last.end, span.end);
    else merged.push({ ...span });
  }
  return merged;
}

function DayColumn({
  day,
  blocks,
  height,
  pixelsPerHour,
  toPx,
  showGaps,
}: DayColumnProps) {
  const layout = layoutDay(blocks, day);
  const items: DayItem[] = [
    ...layout.meetings.map((block) => ({
      kind: "block" as const,
      start: block.meeting.start,
      block,
    })),
    ...(showGaps ? layout.gaps : []).map((gap) => ({
      kind: "gap" as const,
      start: gap.start,
      gap,
    })),
  ].sort((a, b) => a.start - b.start);

  return (
    <div className="relative" style={{ height }}>
      <ul
        aria-label={DAY_NAMES[day]}
        className="absolute inset-0 m-0 list-none rounded-xl p-0 ring-1 ring-border ring-inset"
        style={{
          backgroundImage: `repeating-linear-gradient(to bottom, transparent 0 ${pixelsPerHour - 1}px, var(--border) ${pixelsPerHour - 1}px ${pixelsPerHour}px)`,
        }}
      >
        {items.map((item) =>
          item.kind === "gap" ? (
            <GapItem key={`gap-${item.start}`} gap={item.gap} toPx={toPx} />
          ) : (
            <BlockItem
              key={item.block.meeting.id}
              positioned={item.block}
              toPx={toPx}
            />
          ),
        )}
      </ul>
      {mergedConflicts(layout.meetings).map((span) => (
        <ConflictLabel key={span.start} span={span} toPx={toPx} />
      ))}
    </div>
  );
}

/** One label across the column per clash; screen readers get it from each block. */
function ConflictLabel({
  span,
  toPx,
}: {
  span: TimeSpan;
  toPx: (m: number) => number;
}) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute z-10 flex justify-center"
      style={{
        top: toPx(span.start) + BLOCK_INSET_PX,
        left: BLOCK_INSET_PX,
        right: BLOCK_INSET_PX,
      }}
    >
      <span className="inline-flex h-5 max-w-full items-center gap-1 truncate rounded-2xl bg-background px-2 text-xs font-medium text-destructive shadow-sm">
        <CircleXIcon className="size-3 shrink-0" />
        <span className="truncate">
          Overlaps {formatTimeRange(span.start, span.end)}
        </span>
      </span>
    </span>
  );
}

function GapItem({
  gap,
  toPx,
}: {
  gap: TimeSpan;
  toPx: (m: number) => number;
}) {
  const label = `${formatDuration(gap.end - gap.start)} gap`;
  return (
    <li
      className="absolute grid place-items-center rounded-xl bg-[repeating-linear-gradient(135deg,var(--muted)_0_6px,transparent_6px_12px)] text-xs text-muted-foreground"
      style={{
        top: toPx(gap.start),
        height: toPx(gap.end) - toPx(gap.start) - BLOCK_GAP_PX,
        left: BLOCK_INSET_PX,
        right: BLOCK_INSET_PX,
      }}
    >
      <span className="rounded-2xl bg-background px-2 py-0.5 font-medium text-foreground">
        {label}
      </span>
    </li>
  );
}

/** How many 16 px text lines fit in a block of this height. */
function linesThatFit(heightPx: number): number {
  return Math.floor((heightPx - BLOCK_PADDING_Y_PX * 2) / LINE_HEIGHT_PX);
}

function BlockItem({
  positioned,
  toPx,
}: {
  positioned: PositionedMeeting<WeekCalendarBlock>;
  toPx: (m: number) => number;
}) {
  const { meeting: block, column, columns, conflict } = positioned;
  const heightPx = toPx(block.end) - toPx(block.start) - BLOCK_GAP_PX;
  const widthPercent = 100 / columns;
  const style: React.CSSProperties = {
    top: toPx(block.start),
    height: heightPx,
    left: `calc(${column * widthPercent}% + ${BLOCK_INSET_PX}px)`,
    width: `calc(${widthPercent}% - ${BLOCK_INSET_PX * 2}px)`,
  };
  const description = describeBlock(block, conflict);
  // Split columns are too narrow for details; those go in the tooltip.
  const lines = columns > 1 ? 1 : linesThatFit(heightPx);

  const visual = (
    <div
      aria-hidden
      className={cn(
        "size-full",
        blockAppearance(block),
        lines <= 1 && "justify-center",
      )}
      style={blockStyle(block)}
    >
      <BlockContent block={block} lines={lines} />
    </div>
  );

  return (
    <li className="absolute" style={style}>
      <span className="sr-only">{description}</span>
      {lines <= 1 ? (
        <Tooltip>
          <TooltipTrigger render={visual} />
          <TooltipContent>{description}</TooltipContent>
        </Tooltip>
      ) : (
        visual
      )}
      {conflict && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-xl ring-2 ring-destructive ring-inset"
        />
      )}
    </li>
  );
}

function blockAppearance(block: WeekCalendarBlock): string {
  const base =
    "flex flex-col overflow-hidden rounded-xl px-2.5 py-1.5 text-xs leading-4";
  if (block.ghost) {
    return cn(base, "border-2 border-dashed border-ring bg-background");
  }
  if (!block.color) {
    return cn(base, "bg-muted text-foreground ring-1 ring-border ring-inset");
  }
  if (block.appearance === "tint") {
    return cn(base, "text-foreground ring-2 ring-inset");
  }
  return cn(
    base,
    "text-white",
    courseBackgroundClass(block.color),
    block.color.hatched && COURSE_HATCH_CLASS,
  );
}

/** Tints are computed from the course color, so they're set inline. */
function blockStyle(block: WeekCalendarBlock): React.CSSProperties | undefined {
  if (block.ghost || !block.color || block.appearance !== "tint")
    return undefined;
  const color = courseColorVar(block.color);
  return {
    backgroundColor: `oklch(from ${color} 0.93 calc(c * 0.4) h)`,
    ["--tw-ring-color" as string]: color,
  };
}

/**
 * Lines in priority order: heading, then title, time and room as height
 * allows. Each line truncates rather than wrapping.
 */
function BlockContent({
  block,
  lines,
}: {
  block: WeekCalendarBlock;
  lines: number;
}) {
  const heading = `${block.code} · ${block.section}`;
  const flagLowRating =
    block.rating != null && ratingBand(block.rating) === "low";
  const detailClass = block.ghost ? "text-muted-foreground" : "opacity-90";

  return (
    <>
      <span className="flex min-w-0 items-center justify-between gap-1 font-medium">
        <span className="truncate">{heading}</span>
        {lines > 1 && block.pinned && <LockIcon className="size-3 shrink-0" />}
        {lines > 1 && flagLowRating && block.rating != null && (
          <span className="shrink-0 rounded-2xl bg-background px-1.5 text-destructive tabular-nums">
            {formatRating(block.rating)}
          </span>
        )}
        {lines > 1 && !block.pinned && !flagLowRating && block.kind && (
          <span className="shrink-0 truncate opacity-85">{block.kind}</span>
        )}
      </span>
      {lines >= 3 && (
        <span className="truncate text-[13px] font-medium">{block.title}</span>
      )}
      {lines >= 2 && (
        <span className={cn("truncate tabular-nums", detailClass)}>
          {formatTimeRange(block.start, block.end)}
        </span>
      )}
      {lines >= 4 && block.location && (
        <span className={cn("truncate", detailClass)}>{block.location}</span>
      )}
    </>
  );
}

function UnscheduledTray({
  sections,
}: {
  sections: readonly UnscheduledSection[];
}) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-2 rounded-xl bg-muted/50 p-3"
    >
      <h3 id={headingId} className="text-sm font-medium">
        No set meeting time
      </h3>
      <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
        {sections.map((s) => (
          <li key={s.id} className="flex flex-wrap gap-x-2">
            <span className="font-medium">
              {s.code} · {s.section}
            </span>
            <span>{s.title}</span>
            {s.note && <span className="text-foreground/80">{s.note}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

export { WeekCalendar };
