import type * as React from "react";
import { cn } from "cn";
import {
  WEEKDAYS,
  describeDays,
  parseDays,
  type WeekDay,
} from "@workspace/shared/lib/meeting-times";

interface DayStripProps extends React.ComponentProps<"span"> {
  /** Banner days string, e.g. "TR". */
  days: string;
}

/** Monday–Friday with meeting days filled in. Weekend days appear only when used. */
function DayStrip({ days, className, ...props }: DayStripProps) {
  const meets = parseDays(days);
  const weekend = meets.filter((d) => !WEEKDAYS.includes(d));
  const shown: WeekDay[] = [...WEEKDAYS, ...weekend];
  const label = meets.length
    ? `Meets ${describeDays(meets)}`
    : "No set meeting days";

  return (
    <span
      data-slot="day-strip"
      role="img"
      aria-label={label}
      className={cn("inline-flex gap-0.5", className)}
      {...props}
    >
      {shown.map((day) => (
        <span
          key={day}
          className={cn(
            "grid size-5 place-items-center rounded-md text-xs font-medium",
            meets.includes(day)
              ? "bg-primary text-primary-foreground"
              : // muted-foreground on bg-muted is under 4.5:1, so off days use dimmed foreground.
                "bg-muted text-foreground/60",
          )}
        >
          {day}
        </span>
      ))}
    </span>
  );
}

export { DayStrip };
