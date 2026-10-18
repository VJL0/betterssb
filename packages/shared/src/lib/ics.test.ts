import { describe, expect, it } from "vitest";
import { buildIcs, type CalendarMeeting } from "./ics";

const NOW = new Date(Date.UTC(2026, 9, 17, 12, 0, 0));

function meeting(overrides: Partial<CalendarMeeting> = {}): CalendarMeeting {
  return {
    uid: "7273-0@betterssb",
    summary: "CIS 2168 · 001 Data Structures",
    location: "SERC 116",
    description: "CRN 7273",
    days: "TR",
    start: 570,
    end: 650,
    // A Monday.
    startDate: "01/11/2027",
    endDate: "05/03/2027",
    ...overrides,
  };
}

describe("buildIcs", () => {
  it("makes a weekly event starting on the first meeting day", () => {
    const { ics, skipped } = buildIcs([meeting()], NOW);
    expect(skipped).toBe(0);
    expect(ics).toContain("DTSTART:20270112T093000");
    expect(ics).toContain("DTEND:20270112T105000");
    expect(ics).toContain(
      "RRULE:FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20270503T235959",
    );
    expect(ics).toContain("DTSTAMP:20261017T120000Z");
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("starts on the start date when it's a meeting day", () => {
    const { ics } = buildIcs([meeting({ days: "MW" })], NOW);
    expect(ics).toContain("DTSTART:20270111T093000");
  });

  it("escapes commas, semicolons and backslashes in text", () => {
    const { ics } = buildIcs(
      [meeting({ summary: "Data; Structures, I \\ II" })],
      NOW,
    );
    expect(ics).toContain("SUMMARY:Data\\; Structures\\, I \\\\ II");
  });

  it("skips meetings without days or dates", () => {
    const { ics, skipped } = buildIcs(
      [meeting({ days: "" }), meeting({ startDate: "" })],
      NOW,
    );
    expect(skipped).toBe(2);
    expect(ics).not.toContain("BEGIN:VEVENT");
  });
});
