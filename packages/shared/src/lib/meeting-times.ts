export const MINUTES_PER_HOUR = 60;
const NOON_HOUR = 12;
const HOURS_PER_DAY = 24;

/** Banner day letters in week order. R is Thursday and U is Sunday. */
export const WEEK_DAYS = ["M", "T", "W", "R", "F", "S", "U"] as const;
export type WeekDay = (typeof WEEK_DAYS)[number];

export const WEEKDAYS: readonly WeekDay[] = ["M", "T", "W", "R", "F"];

export const DAY_NAMES: Record<WeekDay, string> = {
  M: "Monday",
  T: "Tuesday",
  W: "Wednesday",
  R: "Thursday",
  F: "Friday",
  S: "Saturday",
  U: "Sunday",
};

export function isWeekDay(letter: string): letter is WeekDay {
  return (WEEK_DAYS as readonly string[]).includes(letter);
}

/** Day letters of a Banner days string ("TR"), in week order, ignoring unknown letters. */
export function parseDays(days: string): WeekDay[] {
  const present = new Set(days.toUpperCase().split(""));
  return WEEK_DAYS.filter((d) => present.has(d));
}

/** "Tuesday and Thursday", "Monday, Wednesday and Friday". */
export function describeDays(days: readonly WeekDay[]): string {
  const names = days.map((d) => DAY_NAMES[d]);
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Minutes after midnight for "HH:MM" or Banner's "HHMM". NaN if unreadable. */
export function parseClockTime(time: string): number {
  const match = /^(\d{1,2}):?(\d{2})$/.exec(time.trim());
  if (!match) return Number.NaN;
  return Number(match[1]) * MINUTES_PER_HOUR + Number(match[2]);
}

function meridiem(minutes: number): "AM" | "PM" {
  return Math.floor(minutes / MINUTES_PER_HOUR) % HOURS_PER_DAY >= NOON_HOUR
    ? "PM"
    : "AM";
}

/** "9:30", on a 12-hour clock without AM/PM. */
export function formatClock(minutes: number): string {
  const hour24 = Math.floor(minutes / MINUTES_PER_HOUR) % HOURS_PER_DAY;
  const hour12 = hour24 % NOON_HOUR || NOON_HOUR;
  const mins = String(minutes % MINUTES_PER_HOUR).padStart(2, "0");
  return `${hour12}:${mins}`;
}

/** "9:30–10:50 AM", or "11:00 AM–12:15 PM" when the range crosses noon. */
export function formatTimeRange(start: number, end: number): string {
  const startMeridiem = meridiem(start);
  const endMeridiem = meridiem(end);
  if (startMeridiem === endMeridiem) {
    return `${formatClock(start)}–${formatClock(end)} ${endMeridiem}`;
  }
  return `${formatClock(start)} ${startMeridiem}–${formatClock(end)} ${endMeridiem}`;
}

/** "45 min", "1h", "1h 10m". */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  const mins = minutes % MINUTES_PER_HOUR;
  if (hours === 0) return `${mins} min`;
  return mins === 0 ? `${hours}h` : `${hours}h ${mins}m`;
}
