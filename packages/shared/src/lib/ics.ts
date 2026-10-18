/**
 * Builds an iCalendar file (RFC 5545) of weekly class meetings, so a schedule
 * can be added to Google Calendar, Apple Calendar or Outlook.
 */
import { MINUTES_PER_HOUR, parseDays, type WeekDay } from "./meeting-times";

export interface CalendarMeeting {
  uid: string;
  summary: string;
  location: string;
  description: string;
  /** Banner days string, e.g. "TR". */
  days: string;
  /** Minutes after midnight. */
  start: number;
  end: number;
  /** First and last day of classes, "MM/DD/YYYY" as Banner sends them. */
  startDate: string;
  endDate: string;
}

const ICS_DAY: Record<WeekDay, string> = {
  M: "MO",
  T: "TU",
  W: "WE",
  R: "TH",
  F: "FR",
  S: "SA",
  U: "SU",
};
// Date.getUTCDay() numbers, Sunday first.
const DAY_NUMBER: Record<WeekDay, number> = {
  U: 0,
  M: 1,
  T: 2,
  W: 3,
  R: 4,
  F: 5,
  S: 6,
};
const DAYS_PER_WEEK = 7;

function parseBannerDate(value: string): Date | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) return null;
  return new Date(
    Date.UTC(Number(match[3]), Number(match[1]) - 1, Number(match[2])),
  );
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function dateStamp(date: Date): string {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;
}

function localTime(date: Date, minutes: number): string {
  const h = Math.floor(minutes / MINUTES_PER_HOUR);
  return `${dateStamp(date)}T${pad(h)}${pad(minutes % MINUTES_PER_HOUR)}00`;
}

/** The first class: the earliest meeting day on or after the start date. */
function firstOccurrence(startDate: Date, days: WeekDay[]): Date {
  const offsets = days.map(
    (d) =>
      (DAY_NUMBER[d] - startDate.getUTCDay() + DAYS_PER_WEEK) % DAYS_PER_WEEK,
  );
  const first = new Date(startDate);
  first.setUTCDate(first.getUTCDate() + Math.min(...offsets));
  return first;
}

/** Escapes text values (RFC 5545 §3.3.11). */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function event(m: CalendarMeeting, stamp: string): string[] | null {
  const days = parseDays(m.days);
  const startDate = parseBannerDate(m.startDate);
  const endDate = parseBannerDate(m.endDate);
  if (days.length === 0 || !startDate || !endDate) return null;
  const first = firstOccurrence(startDate, days);
  // Floating local times: classes happen at the campus's wall-clock time.
  return [
    "BEGIN:VEVENT",
    `UID:${m.uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${localTime(first, m.start)}`,
    `DTEND:${localTime(first, m.end)}`,
    `RRULE:FREQ=WEEKLY;BYDAY=${days.map((d) => ICS_DAY[d]).join(",")};UNTIL=${dateStamp(endDate)}T235959`,
    `SUMMARY:${escapeText(m.summary)}`,
    `LOCATION:${escapeText(m.location)}`,
    `DESCRIPTION:${escapeText(m.description)}`,
    "END:VEVENT",
  ];
}

/** Meetings without days or dates are left out; returns the file and how many were. */
export function buildIcs(
  meetings: readonly CalendarMeeting[],
  now = new Date(),
): { ics: string; skipped: number } {
  const stamp = `${dateStamp(now)}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//BetterSSB//Schedule//EN",
    "CALSCALE:GREGORIAN",
  ];
  let skipped = 0;
  for (const m of meetings) {
    const eventLines = event(m, stamp);
    if (eventLines) lines.push(...eventLines);
    else skipped++;
  }
  lines.push("END:VCALENDAR");
  return { ics: `${lines.join("\r\n")}\r\n`, skipped };
}
