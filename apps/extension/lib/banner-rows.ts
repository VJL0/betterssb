import {
  parseClockTime,
  type WeekDay,
} from "@workspace/shared/lib/meeting-times";
import type { SeatCounts } from "@workspace/shared/lib/seats";
import type { PlannedMeeting } from "@workspace/shared/types/store";

/**
 * Reads the section rows of Banner 9's class search results grid (the same
 * grid on Browse Classes, Plan Ahead and Register's Find Classes). Each cell
 * carries a `data-property` naming its column, which survives Banner hiding
 * columns at narrow widths.
 */

export interface BannerInstructor {
  name: string;
  /** Banner's link for this instructor; a rating sits right before it. */
  link: Element;
}

export interface BannerRow {
  row: HTMLTableRowElement;
  term: string | null;
  crn: string;
  /** "CIS 2168", when Banner renders the subject/course/section column. */
  courseCode: string | null;
  section: string | null;
  meetings: PlannedMeeting[];
  seats: SeatCounts | null;
  instructors: BannerInstructor[];
  titleCell: Element | null;
  statusCell: Element | null;
}

const CELL = (property: string) => `td[data-property="${property}"]`;
const CRN_CELL = CELL("courseReferenceNumber");

const DAY_LETTERS: Record<string, WeekDay> = {
  Monday: "M",
  Tuesday: "T",
  Wednesday: "W",
  Thursday: "R",
  Friday: "F",
  Saturday: "S",
  Sunday: "U",
};

const SEATS = /(-?\d+)\s+of\s+(\d+)\s+seats\s+remain/i;
const WAITLIST = /(-?\d+)\s+of\s+(\d+)\s+waitlist\s+seats\s+remain/i;
const TIME_RANGE =
  /(\d{1,2}):(\d{2})\s*(AM|PM)\s*-\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i;
const COURSE_SECTION = /^\s*([A-Z]{2,5})\s+(\S+?),\s*(\S+)\s*$/;
const NOON_HOUR = 12;

/** Banner's "12 of 30 seats remain. 4 of 10 waitlist seats remain." as counts. */
export function parseSeatText(text: string): SeatCounts | null {
  const seats = SEATS.exec(text);
  if (!seats) return null;
  const waitlist = WAITLIST.exec(text);
  const waitAvailable = waitlist ? Number(waitlist[1]) : 0;
  const waitCapacity = waitlist ? Number(waitlist[2]) : 0;
  return {
    seatsAvailable: Number(seats[1]),
    maximumEnrollment: Number(seats[2]),
    waitAvailable,
    waitCapacity,
    waitCount: Math.max(0, waitCapacity - waitAvailable),
  };
}

function to24Hour(hour: string, minute: string, meridiem: string): number {
  const h = Number(hour) % NOON_HOUR;
  const pm = meridiem.toUpperCase() === "PM";
  return parseClockTime(`${pm ? h + NOON_HOUR : h}:${minute}`);
}

function tooltipValue(meeting: Element, label: string): string | null {
  for (const row of meeting.querySelectorAll(".tooltip-row")) {
    const text = row.textContent?.replace(/\s+/g, " ").trim() ?? "";
    if (text.startsWith(`${label}:`)) {
      return text.slice(label.length + 1).trim() || null;
    }
  }
  return null;
}

function meetingDays(meeting: Element): string {
  const checked = [
    ...meeting.querySelectorAll('li[aria-checked="true"][data-name]'),
  ].map((li) => li.getAttribute("data-name") ?? "");
  const names =
    checked.length > 0
      ? checked
      : (meeting.querySelector(".ui-pillbox-summary")?.textContent ?? "").split(
          ",",
        );
  return names
    .map((name) => DAY_LETTERS[name.trim()])
    .filter(Boolean)
    .join("");
}

/** The meetings in a Meeting Times cell, in the plan's shape. */
export function parseMeetingCell(cell: Element): PlannedMeeting[] {
  return [...cell.querySelectorAll(".meeting")].map((meeting) => {
    const schedule = meeting.querySelector(".meeting-schedule") ?? meeting;
    const time = TIME_RANGE.exec(schedule.textContent ?? "");
    return {
      days: meetingDays(meeting),
      start: time ? to24Hour(time[1]!, time[2]!, time[3]!) : null,
      end: time ? to24Hour(time[4]!, time[5]!, time[6]!) : null,
      location: [
        tooltipValue(meeting, "Building"),
        tooltipValue(meeting, "Room"),
      ]
        .filter(Boolean)
        .join(" "),
      startDate: tooltipValue(meeting, "Start Date"),
      endDate: tooltipValue(meeting, "End Date"),
    };
  });
}

function instructorsIn(cell: Element | null): BannerInstructor[] {
  if (!cell) return [];
  return [...cell.querySelectorAll("a.email")]
    .map((link) => ({
      name: link.textContent?.replace(/\s+/g, " ").trim() ?? "",
      link,
    }))
    .filter((i) => i.name.length > 0);
}

/** The title link carries "term,crn" for Banner's own details dialog. */
function termOf(titleCell: Element | null): string | null {
  const attributes = titleCell
    ?.querySelector("[data-attributes]")
    ?.getAttribute("data-attributes");
  const term = attributes?.split(",")[0]?.trim();
  return term && /^\d{6}$/.test(term) ? term : null;
}

function readRow(row: HTMLTableRowElement): BannerRow | null {
  const cell = (property: string) => row.querySelector(CELL(property));
  const crn = cell("courseReferenceNumber")?.textContent?.trim() ?? "";
  if (!/^\d{4,6}$/.test(crn)) return null;
  const titleCell = cell("courseTitle");
  const statusCell = cell("status");
  const meetingCell = cell("meetingTime");
  const course = COURSE_SECTION.exec(
    cell("subjectCourseSectionNumber")?.textContent ?? "",
  );
  return {
    row,
    term: termOf(titleCell),
    crn,
    courseCode: course ? `${course[1]} ${course[2]}` : null,
    section: course ? course[3]! : null,
    meetings: meetingCell ? parseMeetingCell(meetingCell) : [],
    seats: statusCell ? parseSeatText(statusCell.textContent ?? "") : null,
    instructors: instructorsIn(cell("instructor")),
    titleCell,
    statusCell,
  };
}

/** Every section row in Banner's results grids under `root`. */
export function readBannerRows(root: ParentNode): BannerRow[] {
  const rows = new Set<HTMLTableRowElement>();
  for (const crnCell of root.querySelectorAll(CRN_CELL)) {
    const row = crnCell.closest("tr");
    if (row) rows.add(row);
  }
  return [...rows].map(readRow).filter((row): row is BannerRow => row !== null);
}
