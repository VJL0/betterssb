import { describe, expect, it } from "vitest";
import type { ClassSection } from "../types/classes";
import type { PlannedSection } from "../types/store";
import {
  addCourse,
  addSection,
  courseKey,
  splitCourseCode,
  emptyPlan,
  planConflicts,
  planCourseColor,
  planCredits,
  plannedSectionFrom,
  removeSection,
  replaceSections,
} from "./plan";

const NOW = "2026-10-17T12:00:00.000Z";

function meeting(days: string, start: number | null, end: number | null) {
  return { days, start, end, location: "", startDate: null, endDate: null };
}

function planned(
  crn: string,
  courseId: string,
  overrides: Partial<PlannedSection> = {},
): PlannedSection {
  return {
    crn,
    courseId,
    courseCode: courseId,
    section: "001",
    title: "",
    credits: 4,
    scheduleType: "Lecture",
    instructor: "TBA",
    meetings: [meeting("TR", 570, 650)],
    addedAt: NOW,
    ...overrides,
  };
}

describe("plannedSectionFrom", () => {
  it("keeps what the plan needs from a Banner section", () => {
    const section = {
      courseReferenceNumber: "7273",
      subject: "CIS",
      courseNumber: "2168",
      subjectCourse: "CIS2168",
      sequenceNumber: "001",
      courseTitle: "Data Structures",
      creditHourLow: 4,
      creditHours: null,
      scheduleTypeDescription: "Lecture",
      faculty: [
        {
          bannerId: "1",
          displayName: "Example, Pat",
          emailAddress: null,
          primaryIndicator: true,
        },
      ],
      meetingsFaculty: [
        {
          meetingTime: {
            beginTime: "0900",
            endTime: "1050",
            buildingDescription: "SERC",
            room: "116",
            startDate: "01/11/2027",
            endDate: "05/03/2027",
            monday: true,
            tuesday: false,
            wednesday: true,
            thursday: false,
            friday: false,
            saturday: false,
            sunday: false,
          },
        },
      ],
    } as unknown as ClassSection;
    expect(plannedSectionFrom(section, NOW)).toMatchObject({
      crn: "7273",
      courseId: "CIS2168",
      courseCode: "CIS 2168",
      credits: 4,
      instructor: "Example, Pat",
      meetings: [
        {
          days: "MW",
          start: 540,
          end: 650,
          location: "SERC 116",
          startDate: "01/11/2027",
        },
      ],
    });
  });
});

describe("plan edits", () => {
  it("adds a section once and gives its course a color", () => {
    let plan = emptyPlan("202703", "Spring 2027");
    plan = addSection(plan, planned("1", "CIS2168"), NOW);
    plan = addSection(plan, planned("1", "CIS2168"), NOW);
    expect(plan.sections).toHaveLength(1);
    expect(planCourseColor(plan, "CIS2168")).toEqual({
      slot: 1,
      hatched: false,
    });
    expect(plan.updatedAt).toBe(NOW);
  });

  it("keeps colors stable when a course is removed", () => {
    let plan = emptyPlan("202703", "Spring 2027");
    plan = addSection(plan, planned("1", "CIS2168"), NOW);
    plan = addSection(plan, planned("2", "CIS2107"), NOW);
    plan = addSection(plan, planned("3", "MATH2101"), NOW);
    plan = removeSection(plan, "2", NOW);
    expect(planCourseColor(plan, "MATH2101")?.slot).toBe(3);
    expect(planCourseColor(plan, "CIS2107")).toBeNull();
  });

  it("colors a planned course and its sections the same", () => {
    let plan = emptyPlan("202736", "Fall 2027");
    plan = addCourse(
      plan,
      {
        id: "c1",
        code: "CIS 3207",
        title: "",
        credits: 4,
        requirement: null,
        addedAt: NOW,
      },
      NOW,
    );
    expect(courseKey("cis 3207")).toBe("CIS3207");
    expect(planCourseColor(plan, "CIS3207")?.slot).toBe(1);
  });

  it("replaces sections but keeps planned courses", () => {
    let plan = emptyPlan("202703", "Spring 2027");
    plan = addCourse(
      plan,
      {
        id: "c1",
        code: null,
        title: "GenEd Arts",
        credits: 3,
        requirement: "Arts",
        addedAt: NOW,
      },
      NOW,
    );
    plan = replaceSections(plan, [planned("9", "CIS2168")], NOW);
    expect(plan.sections.map((s) => s.crn)).toEqual(["9"]);
    expect(plan.courses).toHaveLength(1);
  });
});

describe("planCredits", () => {
  it("counts a course once across its lecture and lab", () => {
    let plan = emptyPlan("202703", "Spring 2027");
    plan = addSection(plan, planned("1", "CIS2107", { credits: 4 }), NOW);
    plan = addSection(
      plan,
      planned("2", "CIS2107", { credits: 0, scheduleType: "Laboratory" }),
      NOW,
    );
    plan = addSection(plan, planned("3", "MATH2101", { credits: 3 }), NOW);
    plan = addCourse(
      plan,
      {
        id: "c",
        code: null,
        title: "Elective",
        credits: 3,
        requirement: null,
        addedAt: NOW,
      },
      NOW,
    );
    expect(planCredits(plan)).toBe(10);
  });

  it("doesn't count a planned course again once it has a section", () => {
    let plan = emptyPlan("202703", "Spring 2027");
    plan = addCourse(
      plan,
      {
        id: "c",
        code: "CIS 2168",
        title: "Data Structures",
        credits: 4,
        requirement: null,
        addedAt: NOW,
      },
      NOW,
    );
    plan = addSection(plan, planned("1", "CIS2168", { credits: 4 }), NOW);
    expect(planCredits(plan)).toBe(4);
  });
});

describe("planConflicts", () => {
  it("finds overlapping meetings on a shared day", () => {
    const conflicts = planConflicts([
      planned("1", "A", { meetings: [meeting("TR", 570, 650)] }),
      planned("2", "B", { meetings: [meeting("R", 600, 700)] }),
      planned("3", "C", { meetings: [meeting("MW", 570, 650)] }),
    ]);
    expect(
      conflicts.map((c) => [c.a.crn, c.b.crn, c.day, c.start, c.end]),
    ).toEqual([["1", "2", "R", 600, 650]]);
  });

  it("ignores meetings without a time", () => {
    expect(
      planConflicts([
        planned("1", "A", { meetings: [meeting("", null, null)] }),
        planned("2", "B"),
      ]),
    ).toEqual([]);
  });
});

describe("splitCourseCode", () => {
  it.each([
    ["CIS 2168", { subject: "CIS", courseNumber: "2168" }],
    ["math1041", { subject: "MATH", courseNumber: "1041" }],
    ["ENG 0802H", { subject: "ENG", courseNumber: "0802H" }],
  ])("splits %j", (code, parts) => {
    expect(splitCourseCode(code)).toEqual(parts);
  });

  it("is null for a placeholder", () => {
    expect(splitCourseCode("CIS elective")).toBeNull();
  });
});
