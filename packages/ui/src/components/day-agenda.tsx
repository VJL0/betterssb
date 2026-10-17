import { useState } from "react";
import type * as React from "react";
import { cn } from "cn";
import {
  DAY_NAMES,
  formatDuration,
  formatClock,
  formatTimeRange,
  type WeekDay,
} from "@workspace/shared/lib/meeting-times";

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs";
import type { WeekCalendarBlock } from "@workspace/ui/components/week-calendar";
import {
  blockAppearance,
  blockStyle,
} from "@workspace/ui/lib/course-block-style";
import { layoutDay } from "@workspace/ui/lib/week-layout";

const DAY_SHORT_LENGTH = 3;

interface DayAgendaProps extends Omit<React.ComponentProps<"div">, "children"> {
  blocks: readonly WeekCalendarBlock[];
  days: readonly WeekDay[];
}

type AgendaItem =
  | { kind: "class"; block: WeekCalendarBlock; start: number }
  | { kind: "gap"; start: number; end: number };

function itemsFor(
  blocks: readonly WeekCalendarBlock[],
  day: WeekDay,
): AgendaItem[] {
  const layout = layoutDay(blocks, day);
  return [
    ...layout.meetings.map(({ meeting }): AgendaItem => ({
      kind: "class",
      block: meeting,
      start: meeting.start,
    })),
    ...layout.gaps.map((gap): AgendaItem => ({
      kind: "gap",
      start: gap.start,
      end: gap.end,
    })),
  ].sort((a, b) => a.start - b.start);
}

function classCount(blocks: readonly WeekCalendarBlock[], day: WeekDay) {
  const count = layoutDay(blocks, day).meetings.length;
  return `${count} ${count === 1 ? "class" : "classes"}`;
}

/**
 * One day of classes at a time, for phones (W-Mobile): day tabs with class
 * counts, then the day's classes in order with free time between them.
 */
function DayAgenda({ blocks, days, className, ...props }: DayAgendaProps) {
  const firstBusy =
    days.find((d) => layoutDay(blocks, d).meetings.length > 0) ?? days[0];
  const [day, setDay] = useState<WeekDay | undefined>(firstBusy);

  return (
    <Tabs
      data-slot="day-agenda"
      value={day}
      onValueChange={(value) => setDay(value as WeekDay)}
      className={cn("gap-3", className)}
      {...props}
    >
      <TabsList
        aria-label="Day"
        className="grid h-auto! w-full gap-1.5 bg-transparent p-0"
        style={{
          gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`,
        }}
      >
        {days.map((d) => (
          <TabsTrigger
            key={d}
            value={d}
            aria-label={`${DAY_NAMES[d]}, ${classCount(blocks, d)}`}
            className="h-13 flex-col gap-0 rounded-3xl bg-muted text-foreground data-active:bg-primary data-active:text-primary-foreground"
          >
            <span>{DAY_NAMES[d].slice(0, DAY_SHORT_LENGTH)}</span>
            <span className="text-[11px] leading-3.5 opacity-80">
              {classCount(blocks, d)}
            </span>
          </TabsTrigger>
        ))}
      </TabsList>

      {days.map((d) => {
        const items = itemsFor(blocks, d);
        return (
          <TabsContent key={d} value={d}>
            {items.length === 0 ? (
              <p className="rounded-2xl bg-sidebar p-4 text-muted-foreground">
                No classes on {DAY_NAMES[d]}.
              </p>
            ) : (
              <ol className="flex flex-col gap-2.5">
                {items.map((item) => (
                  <li
                    key={
                      item.kind === "class"
                        ? item.block.id
                        : `gap-${item.start}`
                    }
                    className="grid grid-cols-[3.5rem_1fr] gap-3"
                  >
                    <span className="pt-2.5 text-xs text-muted-foreground tabular-nums">
                      {formatClock(item.start)}
                    </span>
                    {item.kind === "class" ? (
                      <span
                        className={cn(
                          blockAppearance(item.block),
                          "gap-0.5 rounded-2xl px-3 py-2.5 text-sm leading-5",
                        )}
                        style={blockStyle(item.block)}
                      >
                        <span className="font-medium">
                          {item.block.code} · {item.block.section}
                          {item.block.kind && ` · ${item.block.kind}`}
                        </span>
                        <span className="truncate">{item.block.title}</span>
                        <span className="text-xs leading-4 tabular-nums opacity-90">
                          {[
                            formatTimeRange(item.block.start, item.block.end),
                            item.block.location,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                    ) : (
                      <span className="rounded-2xl bg-[image:repeating-linear-gradient(135deg,var(--muted)_0_6px,var(--background)_6px_12px)] px-3 py-2.5 font-medium text-muted-foreground ring-1 ring-border ring-inset">
                        {formatDuration(item.end - item.start)} free
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </TabsContent>
        );
      })}
    </Tabs>
  );
}

export { DayAgenda };
