import {
  MINUTES_PER_HOUR,
  WEEKDAYS,
} from "@workspace/shared/lib/meeting-times";
import type { Format } from "./banner-filters";
import type { SearchFilters } from "./search-filters";

/**
 * Whole hours, so the panel's hour pickers show what a quick filter set.
 * The ranges overlap on purpose: a 12:30–1:45 class is an afternoon class,
 * and an 11:00–12:15 one still counts as a morning.
 */
const MORNING_ENDS = 13 * MINUTES_PER_HOUR;
const AFTERNOON_STARTS = 12 * MINUTES_PER_HOUR;
const AFTERNOON_ENDS = 18 * MINUTES_PER_HOUR;
const EVENING_STARTS = 17 * MINUTES_PER_HOUR;

const ONLINE: Format[] = ["live", "async"];
const FRIDAY = "F";

/** The term's GenEd area codes; the GenEd quick filter checks them all. */
export interface QuickFilterContext {
  genEdCodes: string[];
}

/** A one-tap shortcut for a setting in the full filters panel. */
export interface QuickFilter {
  label: string;
  isOn: (filters: SearchFilters, context: QuickFilterContext) => boolean;
  turn: (
    filters: SearchFilters,
    on: boolean,
    context: QuickFilterContext,
  ) => SearchFilters;
  /** False when the term has nothing for it to set. */
  available?: (context: QuickFilterContext) => boolean;
}

function timeRange(
  label: string,
  startAfter: number | null,
  endBefore: number | null,
): QuickFilter {
  return {
    label,
    isOn: (f) => f.startAfter === startAfter && f.endBefore === endBefore,
    turn: (f, on) =>
      on
        ? { ...f, startAfter, endBefore }
        : { ...f, startAfter: null, endBefore: null },
  };
}

function withAll(list: readonly string[], items: readonly string[]) {
  return [...list, ...items.filter((item) => !list.includes(item))];
}

function withNone(list: readonly string[], items: readonly string[]) {
  return list.filter((item) => !items.includes(item));
}

function containsAll(list: readonly string[], items: readonly string[]) {
  return items.length > 0 && items.every((item) => list.includes(item));
}

export const QUICK_FILTERS: QuickFilter[] = [
  {
    label: "Open seats",
    isOn: (f) => f.openOnly,
    turn: (f, on) => ({ ...f, openOnly: on }),
  },
  {
    label: "In person",
    isOn: (f) => f.formats.includes("inPerson"),
    turn: (f, on) => ({
      ...f,
      formats: (on
        ? withAll(f.formats, ["inPerson"])
        : withNone(f.formats, ["inPerson"])) as Format[],
    }),
  },
  {
    label: "Online",
    isOn: (f) => containsAll(f.formats, ONLINE),
    turn: (f, on) => ({
      ...f,
      formats: (on
        ? withAll(f.formats, ONLINE)
        : withNone(f.formats, ONLINE)) as Format[],
    }),
  },
  timeRange("Mornings", null, MORNING_ENDS),
  timeRange("Afternoons", AFTERNOON_STARTS, AFTERNOON_ENDS),
  timeRange("Evenings", EVENING_STARTS, null),
  {
    label: "No Fridays",
    isOn: (f) => !f.days.includes(FRIDAY),
    turn: (f, on) => ({
      ...f,
      days: on
        ? f.days.filter((d) => d !== FRIDAY)
        : WEEKDAYS.filter((d) => d === FRIDAY || f.days.includes(d)),
    }),
  },
  {
    label: "GenEd",
    isOn: (f, c) => containsAll(f.attributes, c.genEdCodes),
    turn: (f, on, c) => ({
      ...f,
      attributes: on
        ? withAll(f.attributes, c.genEdCodes)
        : withNone(f.attributes, c.genEdCodes),
    }),
    available: (c) => c.genEdCodes.length > 0,
  },
];
