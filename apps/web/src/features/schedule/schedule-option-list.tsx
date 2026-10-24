import { useState } from "react";
import type { CourseColor } from "@workspace/shared/lib/course-colors";
import {
  MINUTES_PER_HOUR,
  WEEKDAYS,
  parseClockTime,
  parseDays,
} from "@workspace/shared/lib/meeting-times";
import { Card } from "@workspace/ui/components/card";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Kbd } from "@workspace/ui/components/kbd";
import { courseBackgroundClass } from "@workspace/ui/lib/course-color-classes";
import { cn } from "@workspace/ui/lib/utils";
import type { ScheduleOption, TagTone } from "./schedule-options";

/** The thumbnail spans 8 AM to 7 PM, like the design's. */
const THUMB_START = 8 * MINUTES_PER_HOUR;
const THUMB_SPAN = 11 * MINUTES_PER_HOUR;

/** Schedules listed before "Show more", so the chosen week stays near the top on a phone. */
const COLLAPSED_COUNT = 8;

const TAG_VARIANT = {
  success: "success",
  warning: "warning",
  destructive: "destructive",
  neutral: "secondary",
} as const satisfies Record<TagTone, string>;

interface ScheduleOptionListProps {
  options: readonly ScheduleOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  colorFor: (courseId: string) => CourseColor | null;
  /** Kept from an earlier run after a failure: shown faded. */
  stale?: boolean;
}

function percent(minutes: number): string {
  const clamped = Math.min(Math.max(minutes - THUMB_START, 0), THUMB_SPAN);
  return `${(clamped / THUMB_SPAN) * 100}%`;
}

function Thumbnail({
  option,
  colorFor,
}: {
  option: ScheduleOption;
  colorFor: (courseId: string) => CourseColor | null;
}) {
  return (
    <span aria-hidden className="grid h-14 w-18 shrink-0 grid-cols-5 gap-0.5">
      {WEEKDAYS.map((day) => (
        <span
          key={day}
          className="relative rounded-sm bg-sidebar ring-1 ring-border ring-inset"
        >
          {option.meetings
            .filter((m) => parseDays(m.days).includes(day))
            .map((m, i) => {
              const start = parseClockTime(m.startTime);
              const end = parseClockTime(m.endTime);
              const color = colorFor(m.courseId);
              return (
                <span
                  key={i}
                  className={cn(
                    "absolute inset-x-px rounded-xs",
                    color ? courseBackgroundClass(color) : "bg-foreground/40",
                  )}
                  style={{
                    top: percent(start),
                    height: `calc(${percent(end)} - ${percent(start)})`,
                  }}
                />
              );
            })}
        </span>
      ))}
    </span>
  );
}

/** The ranked schedules, picked with a click or `[` and `]`. */
export function ScheduleOptionList({
  options,
  selectedId,
  onSelect,
  colorFor,
  stale = false,
}: ScheduleOptionListProps) {
  const [showAll, setShowAll] = useState(false);
  const selectedIndex = options.findIndex((o) => o.id === selectedId);
  // The chosen one always shows, even when picked with ] past the cut.
  const visibleCount =
    showAll || selectedIndex >= COLLAPSED_COUNT
      ? options.length
      : COLLAPSED_COUNT;
  const hidden = options.length - visibleCount;

  return (
    <section
      aria-labelledby="schedule-options-heading"
      className="flex flex-col gap-2"
    >
      <div className="flex items-center justify-between">
        <h2 id="schedule-options-heading" className="font-medium">
          Schedules
        </h2>
        <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
          <Kbd>[</Kbd>
          <Kbd>]</Kbd> to switch
        </span>
      </div>
      <ul className={cn("flex flex-col gap-2", stale && "opacity-60")}>
        {options.slice(0, visibleCount).map((option, index) => {
          const selected = option.id === selectedId;
          return (
            <li key={option.id}>
              <Card
                render={<button type="button" />}
                aria-pressed={selected}
                onClick={() => onSelect(option.id)}
                className={cn(
                  "w-full flex-row items-center gap-3 rounded-2xl p-2.5 text-left transition-shadow outline-none hover:ring-foreground/20 focus-visible:ring-3 focus-visible:ring-ring/50",
                  selected && "ring-2 ring-primary hover:ring-primary",
                )}
              >
                <Thumbnail option={option} colorFor={colorFor} />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-medium">Schedule {index + 1}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      Score {Math.round(option.score)}
                    </span>
                  </span>
                  {option.tags.length > 0 && (
                    <span className="flex flex-wrap gap-1">
                      {option.tags.map((tag) => (
                        <Badge key={tag.label} variant={TAG_VARIANT[tag.tone]}>
                          {tag.label}
                        </Badge>
                      ))}
                    </span>
                  )}
                </span>
              </Card>
            </li>
          );
        })}
      </ul>
      {hidden > 0 && (
        <Button variant="ghost" size="sm" onClick={() => setShowAll(true)}>
          Show {hidden} more
        </Button>
      )}
    </section>
  );
}
