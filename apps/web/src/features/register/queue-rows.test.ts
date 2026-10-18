import { describe, expect, it } from "vitest";
import {
  addSection,
  emptyPlan,
  plannedSectionFrom,
} from "@workspace/shared/lib/plan";
import type { SSBRegPlanHeader } from "@workspace/shared/types/ssb";
import { classSection, meetingTime } from "@/test/class-section";
import { queueCredits, queueRows } from "./queue-rows";

const NOW = "2026-10-17T12:00:00.000Z";

const plan = [
  classSection(),
  classSection({
    courseReferenceNumber: "41315",
    sequenceNumber: "L01",
    scheduleTypeDescription: "Laboratory",
    creditHourLow: 0,
    meetings: [meetingTime("W", "1300", "1450")],
  }),
].reduce(
  (p, s) => addSection(p, plannedSectionFrom(s, NOW), NOW),
  emptyPlan("202703", "Spring 2027"),
);

const bannerPlan = {
  id: 1,
  term: "202703",
  planCourses: [
    {
      courseReferenceNumber: "52018",
      subject: "MATH",
      courseNumber: "2101",
      courseTitle: "Linear Algebra",
      section: "001",
      creditHours: 3,
    },
  ],
} as unknown as SSBRegPlanHeader;

describe("queueRows", () => {
  it("describes CRNs from the term's plan, a Banner plan, or by number", () => {
    const rows = queueRows(
      ["41207", "52018", "99999"],
      "202703",
      [plan],
      [bannerPlan],
    );
    expect(rows.map((r) => [r.crn, r.code, r.section, r.meets])).toEqual([
      ["41207", "CIS 2168", "001", "TR 9:30–10:50 AM"],
      ["52018", "MATH 2101", "001", null],
      ["99999", null, null, null],
    ]);
  });

  it("ignores plans for other terms", () => {
    expect(queueRows(["41207"], "202736", [plan])[0]!.code).toBeNull();
  });
});

describe("queueCredits", () => {
  it("counts a course once across its lecture and lab", () => {
    const rows = queueRows(
      ["41207", "41315", "52018"],
      "202703",
      [plan],
      [bannerPlan],
    );
    expect(queueCredits(rows)).toBe(7);
  });
});
