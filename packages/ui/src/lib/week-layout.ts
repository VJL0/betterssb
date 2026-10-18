import {
  MINUTES_PER_HOUR,
  parseDays,
  type WeekDay,
} from "@workspace/shared/lib/meeting-times";

/** The web calendar shows 8 AM–6 PM unless classes fall outside it. */
export const DEFAULT_START_HOUR = 8;
export const DEFAULT_END_HOUR = 18;
/** Free time this long or longer between classes is drawn as a gap. */
export const MIN_GAP_MINUTES = 60;

export interface CalendarMeeting {
  id: string;
  /** Banner days string, e.g. "TR". */
  days: string;
  /** Minutes after midnight. */
  start: number;
  end: number;
  /** A hover preview: laid out beside real classes but never a conflict. */
  ghost?: boolean;
}

export interface TimeSpan {
  start: number;
  end: number;
}

export interface PositionedMeeting<T extends CalendarMeeting> {
  meeting: T;
  /** 0-based column among meetings that overlap it, out of `columns`. */
  column: number;
  columns: number;
  /** Where it first overlaps another real class, if it does. */
  conflict: TimeSpan | null;
}

export interface DayLayout<T extends CalendarMeeting> {
  day: WeekDay;
  meetings: PositionedMeeting<T>[];
  gaps: TimeSpan[];
}

export function meetsOn(meeting: CalendarMeeting, day: WeekDay): boolean {
  return parseDays(meeting.days).includes(day);
}

/** Whole hours covering every meeting, never narrower than 8 AM–6 PM. */
export function hourRange(meetings: readonly CalendarMeeting[]): {
  startHour: number;
  endHour: number;
} {
  let startHour = DEFAULT_START_HOUR;
  let endHour = DEFAULT_END_HOUR;
  for (const m of meetings) {
    startHour = Math.min(startHour, Math.floor(m.start / MINUTES_PER_HOUR));
    endHour = Math.max(endHour, Math.ceil(m.end / MINUTES_PER_HOUR));
  }
  return { startHour, endHour };
}

function overlaps(a: TimeSpan, b: TimeSpan): boolean {
  return a.start < b.end && b.start < a.end;
}

function byTime(a: CalendarMeeting, b: CalendarMeeting): number {
  return a.start - b.start || a.end - b.end;
}

/**
 * Columns for one group of transitively overlapping meetings: each takes the
 * first column that's free when it starts.
 */
function assignColumns<T extends CalendarMeeting>(
  group: T[],
): PositionedMeeting<T>[] {
  const columnEnds: number[] = [];
  const placed = group.map((meeting) => {
    let column = columnEnds.findIndex((end) => end <= meeting.start);
    if (column === -1) column = columnEnds.length;
    columnEnds[column] = meeting.end;
    return { meeting, column, columns: 0, conflict: null };
  });
  return placed.map((p) => ({ ...p, columns: columnEnds.length }));
}

function firstConflict(
  meeting: CalendarMeeting,
  others: readonly CalendarMeeting[],
): TimeSpan | null {
  if (meeting.ghost) return null;
  const clash = others
    .filter((o) => o !== meeting && !o.ghost && overlaps(o, meeting))
    .sort(byTime)[0];
  if (!clash) return null;
  return {
    start: Math.max(clash.start, meeting.start),
    end: Math.min(clash.end, meeting.end),
  };
}

function gapsBetween(meetings: readonly CalendarMeeting[]): TimeSpan[] {
  const gaps: TimeSpan[] = [];
  let latestEnd: number | null = null;
  for (const m of meetings.filter((x) => !x.ghost).sort(byTime)) {
    if (latestEnd !== null && m.start - latestEnd >= MIN_GAP_MINUTES) {
      gaps.push({ start: latestEnd, end: m.start });
    }
    latestEnd = latestEnd === null ? m.end : Math.max(latestEnd, m.end);
  }
  return gaps;
}

/** Positions one day's meetings: overlapping ones split the width side by side. */
export function layoutDay<T extends CalendarMeeting>(
  meetings: readonly T[],
  day: WeekDay,
): DayLayout<T> {
  const today = meetings.filter((m) => meetsOn(m, day)).sort(byTime);

  const positioned: PositionedMeeting<T>[] = [];
  let group: T[] = [];
  let groupEnd = -Infinity;
  for (const meeting of today) {
    if (group.length && meeting.start >= groupEnd) {
      positioned.push(...assignColumns(group));
      group = [];
    }
    group.push(meeting);
    groupEnd =
      group.length === 1 ? meeting.end : Math.max(groupEnd, meeting.end);
  }
  if (group.length) positioned.push(...assignColumns(group));

  return {
    day,
    meetings: positioned.map((p) => ({
      ...p,
      conflict: firstConflict(p.meeting, today),
    })),
    gaps: gapsBetween(today),
  };
}
