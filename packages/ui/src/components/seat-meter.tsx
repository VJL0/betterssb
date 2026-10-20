"use client";

import { cn } from "cn";
import {
  seatStatus,
  type SeatCounts,
  type SeatTone,
} from "@workspace/shared/lib/seats";

import { Progress, ProgressLabel } from "@workspace/ui/components/progress";

const TONE_LABEL: Record<SeatTone, string> = {
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive",
  muted: "text-foreground",
};

// Progress renders its own indicator, so the tone is set from the root.
const TONE_INDICATOR: Record<SeatTone, string> = {
  success: "[&_[data-slot=progress-indicator]]:bg-success",
  warning: "[&_[data-slot=progress-indicator]]:bg-warning",
  destructive: "[&_[data-slot=progress-indicator]]:bg-destructive",
  muted: "[&_[data-slot=progress-indicator]]:bg-muted-foreground",
};

const SIZE_CLASSES = {
  default: "gap-y-1.5",
  sm: "gap-y-0.5 text-xs [&_[data-slot=progress-track]]:h-1",
  // One 16 px line, bar first: under Banner's own seat text, which has the counts.
  inline:
    "flex-nowrap items-center gap-x-1.5 text-xs [&_[data-slot=progress-track]]:order-first [&_[data-slot=progress-track]]:h-1.5 [&_[data-slot=progress-track]]:w-14 [&_[data-slot=progress-track]]:shrink-0",
} as const;

interface SeatMeterProps extends SeatCounts {
  /** `sm` fits a dense list; `inline` is one line for Banner's table cells. */
  size?: keyof typeof SIZE_CLASSES;
  className?: string;
}

/** Seats taken, with the status word and the count always shown. Live from Banner. */
function SeatMeter({ size = "default", className, ...counts }: SeatMeterProps) {
  const status = seatStatus(counts);
  const countText = `${status.enrolled}/${status.capacity}`;
  return (
    <Progress
      data-slot="seat-meter"
      value={status.enrolled}
      max={Math.max(status.capacity, 1)}
      getAriaValueText={() =>
        `${status.label}, ${status.enrolled} of ${status.capacity} seats taken`
      }
      className={cn(
        "gap-x-2",
        SIZE_CLASSES[size],
        TONE_INDICATOR[status.tone],
        className,
      )}
    >
      <ProgressLabel
        className={cn(TONE_LABEL[status.tone], size !== "default" && "text-xs")}
      >
        {status.label}
      </ProgressLabel>
      {size !== "inline" && (
        <span
          aria-hidden
          className={cn(
            "ml-auto text-muted-foreground tabular-nums",
            size === "sm" ? "text-xs" : "text-sm",
          )}
        >
          {countText}
        </span>
      )}
    </Progress>
  );
}

export { SeatMeter };
