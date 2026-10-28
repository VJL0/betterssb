import { describe, expect, it } from "vitest";
import {
  localDateTimeValue,
  parsePortalTimestamp,
  parsePriorityRegistration,
} from "./registration-time";

// PriorityRegistration.jsp's answer, as TUportal sent it (leading JSP whitespace included).
const PORTAL_BODY = `


{"items":[{"timeZone":"MN","formattedTime":"Wed Oct 28, 2026 7:00 AM EDT","dateTimestamp":"Wednesday October 28, 2026 7:00:00 AM EDT","desc":"2027 Spring"}]}`;

describe("parsePortalTimestamp", () => {
  it.each([
    ["Wednesday October 28, 2026 7:00:00 AM EDT", "2026-10-28T11:00:00.000Z"],
    ["Monday November 9, 2026 7:00:00 AM EST", "2026-11-09T12:00:00.000Z"],
    ["Friday April 2, 2027 12:30:15 PM EDT", "2027-04-02T16:30:15.000Z"],
    ["Friday April 2, 2027 12:05:00 AM EDT", "2027-04-02T04:05:00.000Z"],
    ["Thursday December 31, 2026 11:59:59 PM EST", "2027-01-01T04:59:59.000Z"],
  ])("reads %j", (text, iso) => {
    expect(parsePortalTimestamp(text)).toBe(iso);
  });

  it.each([
    "Wed Oct 28, 2026 7:00 AM EDT",
    "Wednesday October 28, 2026 7:00:00 AM PST",
    "Wednesday Octember 28, 2026 7:00:00 AM EDT",
    "Wednesday October 28, 2026 13:00:00 PM EDT",
    "",
  ])("rejects %j", (text) => {
    expect(parsePortalTimestamp(text)).toBeNull();
  });
});

describe("parsePriorityRegistration", () => {
  it("reads TUportal's answer", () => {
    expect(parsePriorityRegistration(JSON.parse(PORTAL_BODY))).toEqual([
      { term: "202703", startsAt: "2026-10-28T11:00:00.000Z" },
    ]);
  });

  it("skips items it can't read and answers without items", () => {
    expect(
      parsePriorityRegistration({
        items: [
          null,
          { desc: "2027 Winter", dateTimestamp: "x" },
          { desc: "2027 Summer I" },
          {
            desc: "2027 Summer II",
            dateTimestamp: "Monday March 15, 2027 7:00:00 AM EDT",
          },
        ],
      }),
    ).toEqual([{ term: "202726", startsAt: "2027-03-15T11:00:00.000Z" }]);
    expect(
      parsePriorityRegistration({ notFound: "No data for user." }),
    ).toEqual([]);
    expect(parsePriorityRegistration(null)).toEqual([]);
  });
});

describe("localDateTimeValue", () => {
  it("writes the instant in local time, with seconds", () => {
    const value = localDateTimeValue("2026-10-28T11:00:00.000Z");
    expect(value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    expect(new Date(value).toISOString()).toBe("2026-10-28T11:00:00.000Z");
  });
});
