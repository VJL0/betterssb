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

interface SeatMeterProps extends SeatCounts {
  /** `sm` fits inside a 20 px Banner table cell. */
  size?: "default" | "sm";
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
        size === "sm"
          ? "gap-y-0.5 text-xs [&_[data-slot=progress-track]]:h-1"
          : "gap-y-1.5",
        TONE_INDICATOR[status.tone],
        className,
      )}
    >
      <ProgressLabel
        className={cn(TONE_LABEL[status.tone], size === "sm" && "text-xs")}
      >
        {status.label}
      </ProgressLabel>
      <span
        aria-hidden
        className={cn(
          "ml-auto text-muted-foreground tabular-nums",
          size === "sm" ? "text-xs" : "text-sm",
        )}
      >
        {countText}
      </span>
    </Progress>
  );
}

export { SeatMeter };
