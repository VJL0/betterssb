/**
 * Reads the student's registration times from TUportal's priority
 * registration countdown (PriorityRegistration.jsp), which answers like:
 *
 *   {"items":[{"formattedTime":"Wed Oct 28, 2026 7:00 AM EDT",
 *              "dateTimestamp":"Wednesday October 28, 2026 7:00:00 AM EDT",
 *              "desc":"2027 Spring", "timeZone":"MN"}]}
 */
import { templeTermCodeFromName } from "./terms";

export interface RegistrationTime {
  /** Temple term code, e.g. "202703". */
  term: string;
  /** When the window opens, as an ISO instant. */
  startsAt: string;
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
// "Wednesday October 28, 2026 7:00:00 AM EDT"
const PORTAL_TIMESTAMP =
  /^[A-Za-z]+\s+([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s+(AM|PM)\s+(EDT|EST)$/;
/** Temple is in Philadelphia, so TUportal only ever writes Eastern time. */
const UTC_OFFSET_HOURS = { EDT: -4, EST: -5 } as const;
const HOURS_PER_HALF_DAY = 12;

/**
 * TUportal's `dateTimestamp` as an ISO instant, or null for anything else.
 * Parsed by hand: `Date.parse` doesn't reliably read this format.
 */
export function parsePortalTimestamp(text: string): string | null {
  const match = PORTAL_TIMESTAMP.exec(text.trim());
  if (!match) return null;
  const [, monthName, day, year, hour, minute, second, meridiem, zone] = match;
  const month = MONTHS.indexOf(monthName!);
  const hour12 = Number(hour) % HOURS_PER_HALF_DAY;
  const hour24 = meridiem === "PM" ? hour12 + HOURS_PER_HALF_DAY : hour12;
  if (month === -1 || Number(hour) > HOURS_PER_HALF_DAY) return null;
  const offset = UTC_OFFSET_HOURS[zone as keyof typeof UTC_OFFSET_HOURS];
  const utc = Date.UTC(
    Number(year),
    month,
    Number(day),
    hour24 - offset,
    Number(minute),
    Number(second),
  );
  return new Date(utc).toISOString();
}

/** Every term's registration time in a PriorityRegistration.jsp answer. */
export function parsePriorityRegistration(body: unknown): RegistrationTime[] {
  const items = (body as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) return [];
  return items.flatMap((item: unknown) => {
    const { desc, dateTimestamp } = (item ?? {}) as Record<string, unknown>;
    if (typeof desc !== "string" || typeof dateTimestamp !== "string") {
      return [];
    }
    const term = templeTermCodeFromName(desc);
    const startsAt = parsePortalTimestamp(dateTimestamp);
    return term && startsAt ? [{ term, startsAt }] : [];
  });
}

/** An instant as a `datetime-local` value, with seconds, in this computer's time zone. */
export function localDateTimeValue(instant: string): string {
  const date = new Date(instant);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}
