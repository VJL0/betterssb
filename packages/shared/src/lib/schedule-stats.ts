import {
  MINUTES_PER_HOUR,
  parseClockTime,
  parseDays,
  WEEK_DAYS,
  type WeekDay,
} from "./meeting-times";
import type { SectionOutput as Section } from "@workspace/api-client";

/** A gap this long between classes is flagged. */
export const LONG_GAP_MINUTES = 2 * MINUTES_PER_HOUR;

export interface ScheduleStats {
  daysOnCampus: WeekDay[];
  /** Minutes after midnight of the earliest class, or null with none. */
  earliestStart: number | null;
  latestEnd: number | null;
  /** Total free time between classes on the same day. */
  minutesBetweenClasses: number;
  longestGap: number;
}

interface Block {
  start: number;
  end: number;
}

function blocksByDay(sections: readonly Section[]): Map<WeekDay, Block[]> {
  const byDay = new Map<WeekDay, Block[]>();
  for (const s of sections) {
    const start = parseClockTime(s.startTime);
    const end = parseClockTime(s.endTime);
    if (Number.isNaN(start) || Number.isNaN(end)) continue;
    for (const day of parseDays(s.days)) {
      byDay.set(day, [...(byDay.get(day) ?? []), { start, end }]);
    }
  }
  return byDay;
}

export function scheduleStats(sections: readonly Section[]): ScheduleStats {
  const byDay = blocksByDay(sections);
  let earliestStart: number | null = null;
  let latestEnd: number | null = null;
  let minutesBetweenClasses = 0;
  let longestGap = 0;
  for (const blocks of byDay.values()) {
    const sorted = [...blocks].sort((a, b) => a.start - b.start);
    let reach = sorted[0]!.end;
    for (const b of sorted) {
      earliestStart =
        earliestStart === null ? b.start : Math.min(earliestStart, b.start);
      latestEnd = latestEnd === null ? b.end : Math.max(latestEnd, b.end);
    }
    for (const b of sorted.slice(1)) {
      const gap = b.start - reach;
      if (gap > 0) {
        minutesBetweenClasses += gap;
        longestGap = Math.max(longestGap, gap);
      }
      reach = Math.max(reach, b.end);
    }
  }
  return {
    daysOnCampus: WEEK_DAYS.filter((d) => byDay.has(d)),
    earliestStart,
    latestEnd,
    minutesBetweenClasses,
    longestGap,
  };
}

/** True if every meeting falls on an allowed day. */
export function usesOnlyDays(
  sections: readonly Section[],
  allowed: ReadonlySet<WeekDay>,
): boolean {
  return sections.every((s) => parseDays(s.days).every((d) => allowed.has(d)));
}
