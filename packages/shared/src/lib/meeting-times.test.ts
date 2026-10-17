import { describe, expect, it } from "vitest";
import {
  describeDays,
  formatClock,
  formatDuration,
  formatTimeOfDay,
  formatTimeRange,
  parseClockTime,
  parseDays,
} from "./meeting-times";

describe("parseDays", () => {
  it("returns known letters in week order", () => {
    expect(parseDays("rt")).toEqual(["T", "R"]);
    expect(parseDays("MWFX")).toEqual(["M", "W", "F"]);
  });
});

describe("describeDays", () => {
  it("joins names in plain English", () => {
    expect(describeDays([])).toBe("");
    expect(describeDays(["T"])).toBe("Tuesday");
    expect(describeDays(["T", "R"])).toBe("Tuesday and Thursday");
    expect(describeDays(["M", "W", "F"])).toBe("Monday, Wednesday and Friday");
  });
});

describe("parseClockTime", () => {
  it("reads HH:MM and Banner's HHMM", () => {
    expect(parseClockTime("09:30")).toBe(570);
    expect(parseClockTime("1350")).toBe(830);
  });

  it("is NaN for anything else", () => {
    expect(parseClockTime("9am")).toBeNaN();
    expect(parseClockTime("")).toBeNaN();
  });
});

describe("formatClock", () => {
  it("uses a 12-hour clock", () => {
    expect(formatClock(570)).toBe("9:30");
    expect(formatClock(720)).toBe("12:00");
    expect(formatClock(810)).toBe("1:30");
    expect(formatClock(0)).toBe("12:00");
  });
});

describe("formatTimeRange", () => {
  it("prints the meridiem once when both ends share it", () => {
    expect(formatTimeRange(570, 650)).toBe("9:30–10:50 AM");
    expect(formatTimeRange(750, 830)).toBe("12:30–1:50 PM");
  });

  it("prints both when the range crosses noon", () => {
    expect(formatTimeRange(660, 735)).toBe("11:00 AM–12:15 PM");
  });
});

describe("formatDuration", () => {
  it.each([
    [45, "45 min"],
    [60, "1h"],
    [70, "1h 10m"],
  ])("formats %i minutes as %s", (minutes, text) => {
    expect(formatDuration(minutes)).toBe(text);
  });
});

describe("formatTimeOfDay", () => {
  it.each([
    [570, "9:30 AM"],
    [720, "12:00 PM"],
    [1050, "5:30 PM"],
  ])("%i → %j", (minutes, text) => {
    expect(formatTimeOfDay(minutes)).toBe(text);
  });
});
