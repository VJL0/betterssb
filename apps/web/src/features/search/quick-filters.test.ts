import { describe, expect, it } from "vitest";
import { QUICK_FILTERS, type QuickFilter } from "./quick-filters";
import { DEFAULT_FILTERS } from "./search-filters";

const CONTEXT = { genEdCodes: ["GA", "GW"] };

function quick(label: string): QuickFilter {
  return QUICK_FILTERS.find((q) => q.label === label)!;
}

describe("QUICK_FILTERS", () => {
  it("are all off with the default filters", () => {
    for (const q of QUICK_FILTERS) {
      expect(q.isOn(DEFAULT_FILTERS, CONTEXT)).toBe(false);
    }
  });

  it.each(QUICK_FILTERS.map((q) => q.label))(
    "%s turns on, then back off to the defaults",
    (label) => {
      const q = quick(label);
      const on = q.turn(DEFAULT_FILTERS, true, CONTEXT);
      expect(q.isOn(on, CONTEXT)).toBe(true);
      expect(q.turn(on, false, CONTEXT)).toEqual(DEFAULT_FILTERS);
    },
  );

  it("picks one time of day at a time", () => {
    const mornings = quick("Mornings").turn(DEFAULT_FILTERS, true, CONTEXT);
    const evenings = quick("Evenings").turn(mornings, true, CONTEXT);
    expect(quick("Mornings").isOn(evenings, CONTEXT)).toBe(false);
    expect(evenings).toMatchObject({ startAfter: 17 * 60, endBefore: null });
  });

  it("keeps formats and attributes picked in the panel", () => {
    const picked = {
      ...DEFAULT_FILTERS,
      formats: ["hybrid" as const],
      attributes: ["WI"],
    };
    const online = quick("Online").turn(picked, true, CONTEXT);
    expect(online.formats).toEqual(["hybrid", "live", "async"]);
    expect(quick("Online").turn(online, false, CONTEXT).formats).toEqual([
      "hybrid",
    ]);
    const genEd = quick("GenEd").turn(picked, true, CONTEXT);
    expect(genEd.attributes).toEqual(["WI", "GA", "GW"]);
  });

  it("is on only when every online format or GenEd area is picked", () => {
    const liveOnly = { ...DEFAULT_FILTERS, formats: ["live" as const] };
    expect(quick("Online").isOn(liveOnly, CONTEXT)).toBe(false);
    const oneArea = { ...DEFAULT_FILTERS, attributes: ["GA"] };
    expect(quick("GenEd").isOn(oneArea, CONTEXT)).toBe(false);
  });

  it("puts Friday back in weekday order", () => {
    const noFridays = quick("No Fridays").turn(
      { ...DEFAULT_FILTERS, days: ["M", "W"] },
      false,
      CONTEXT,
    );
    expect(noFridays.days).toEqual(["M", "W", "F"]);
  });

  it("hides GenEd until the term's areas load", () => {
    expect(quick("GenEd").available?.({ genEdCodes: [] })).toBe(false);
  });
});
