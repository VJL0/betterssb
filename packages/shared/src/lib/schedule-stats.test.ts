import { describe, expect, it } from "vitest";
import { scheduleStats, usesOnlyDays } from "./schedule-stats";
import type { SectionOutput as Section } from "@workspace/api-client";

function section(
  crn: string,
  days: string,
  startTime: string,
  endTime: string,
): Section {
  return {
    crn,
    courseId: crn,
    instructor: "",
    days,
    startTime,
    endTime,
    location: "",
    seatsAvailable: 0,
    maxSeats: 0,
    term: "",
    scheduleType: "Lecture",
  };
}

describe("scheduleStats", () => {
  it("summarizes days, first and last class and time between classes", () => {
    const stats = scheduleStats([
      section("a", "TR", "09:30", "10:50"),
      section("b", "MWF", "10:00", "10:50"),
      section("c", "TR", "12:30", "13:50"),
      section("d", "W", "13:00", "14:50"),
    ]);
    expect(stats.daysOnCampus).toEqual(["M", "T", "W", "R", "F"]);
    expect(stats.earliestStart).toBe(570);
    expect(stats.latestEnd).toBe(890);
    // T and R: 10:50→12:30 (100 each); W: 10:50→13:00 (130)
    expect(stats.minutesBetweenClasses).toBe(330);
    expect(stats.longestGap).toBe(130);
  });

  it("handles an empty schedule", () => {
    expect(scheduleStats([])).toMatchObject({
      daysOnCampus: [],
      earliestStart: null,
      minutesBetweenClasses: 0,
    });
  });
});

describe("usesOnlyDays", () => {
  it("rejects schedules with a class on a day that's off", () => {
    const sections = [section("a", "MWF", "10:00", "10:50")];
    expect(usesOnlyDays(sections, new Set(["M", "W", "F"]))).toBe(true);
    expect(usesOnlyDays(sections, new Set(["M", "W"]))).toBe(false);
  });
});
