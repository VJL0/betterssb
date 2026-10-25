import { describe, expect, it } from "vitest";
import type { PlannedCourse, PlannedSection } from "../types/store";
import { addCourse, addSection, emptyPlan } from "./plan";
import {
  auditCourseKeys,
  entryCredits,
  placedRequirements,
  plannedCredits,
  projectedFinish,
  removeEntry,
  termEntries,
} from "./planner";
import type { Audit } from "@workspace/api-client";

const NOW = "2026-10-17T12:00:00.000Z";

function section(
  crn: string,
  code: string,
  overrides: Partial<PlannedSection> = {},
): PlannedSection {
  return {
    crn,
    courseId: code.replace(" ", ""),
    courseCode: code,
    section: "001",
    title: `${code} title`,
    credits: 4,
    scheduleType: "Lecture",
    instructor: "TBA",
    meetings: [],
    addedAt: NOW,
    ...overrides,
  };
}

function course(
  id: string,
  code: string | null,
  overrides: Partial<PlannedCourse> = {},
): PlannedCourse {
  return {
    id,
    code,
    title: code ?? "Elective",
    credits: 3,
    requirement: null,
    addedAt: NOW,
    ...overrides,
  };
}

const audit: Audit = {
  studentName: "",
  programTitle: "BS Computer Science",
  programCode: "CS",
  catalogYear: "2024",
  preparedOn: "10/12/2026",
  graduationDate: "",
  analysisComplete: true,
  degreeTotals: null,
  categoryTotals: [],
  complete: false,
  requirements: [
    {
      code: "CORE",
      category: "Major",
      title: "Major core",
      status: "incomplete",
      notes: [],
      earned: null,
      inProgress: null,
      needs: null,
      requiredCredits: null,
      requiredGpa: null,
      requiredSubrequirements: null,
      requiredCount: null,
      maxCredits: null,
      subrequirements: [
        {
          number: "1",
          title: "",
          notes: [],
          status: "in_progress",
          requiredCredits: null,
          code: "",
          aliases: [],
          required: false,
          requiredCount: null,
          requiredGpa: null,
          maxCredits: null,
          choices: [],
          notFrom: [],
          earned: null,
          inProgress: null,
          needs: null,
          selectFrom: [],
          courses: [
            {
              term: "FA26",
              course: "CIS  2168",
              title: "Data Structures",
              credits: 4,
              grade: "",
              inProgress: true,
              conditionCode: "",
              notes: [],
              transfer: false,
              exception: false,
              bannerTerm: "",
              transferInstitution: "",
              transferCourse: "",
              satisfies: "",
            },
          ],
        },
      ],
    },
  ],
};

describe("termEntries", () => {
  it("lists a course once across its lecture and lab, then planned courses", () => {
    let plan = emptyPlan("202703", "Spring 2027");
    plan = addSection(plan, section("1", "CIS 2107"), NOW);
    plan = addSection(
      plan,
      section("2", "CIS 2107", { credits: 0, scheduleType: "Lab" }),
      NOW,
    );
    plan = addCourse(
      plan,
      course("a", "CIS 2107", { requirement: "CORE" }),
      NOW,
    );
    plan = addCourse(plan, course("b", null), NOW);
    expect(termEntries(plan)).toEqual([
      expect.objectContaining({
        key: "CIS2107",
        credits: 4,
        requirement: "CORE",
        scheduled: true,
      }),
      expect.objectContaining({ key: "b", code: null, scheduled: false }),
    ]);
    expect(entryCredits(termEntries(plan))).toBe(7);
  });
});

describe("plannedCredits", () => {
  it("skips courses the audit already counts but keeps placeholders", () => {
    let spring = emptyPlan("202703", "Spring 2027");
    spring = addSection(spring, section("1", "CIS 2168"), NOW);
    spring = addSection(spring, section("2", "MATH 2101", { credits: 3 }), NOW);
    let fall = emptyPlan("202736", "Fall 2027");
    fall = addCourse(fall, course("x", null), NOW);
    expect(plannedCredits([spring, fall], auditCourseKeys(audit))).toBe(6);
  });
});

describe("placedRequirements", () => {
  it("collects requirements that have a planned course", () => {
    const plan = addCourse(
      emptyPlan("202736", "Fall 2027"),
      course("x", null, { requirement: "ELECT" }),
      NOW,
    );
    expect(placedRequirements([plan])).toEqual(new Set(["ELECT"]));
  });
});

describe("removeEntry", () => {
  it("takes out a course's sections and its course entry", () => {
    let plan = emptyPlan("202703", "Spring 2027");
    plan = addSection(plan, section("1", "CIS 2107"), NOW);
    plan = addSection(
      plan,
      section("2", "CIS 2107", { scheduleType: "Lab" }),
      NOW,
    );
    plan = addSection(plan, section("3", "MATH 2101"), NOW);
    plan = addCourse(plan, course("a", "CIS 2107"), NOW);
    const next = removeEntry(plan, "CIS2107", NOW);
    expect(next.sections.map((s) => s.crn)).toEqual(["3"]);
    expect(next.courses).toEqual([]);
    expect(Object.keys(next.colorOrder)).toEqual(["MATH2101"]);
  });

  it("takes out a placeholder by id", () => {
    const plan = addCourse(
      emptyPlan("202736", "Fall 2027"),
      course("x", null),
      NOW,
    );
    expect(removeEntry(plan, "x", NOW).courses).toEqual([]);
  });
});

describe("projectedFinish", () => {
  const totals = { earned: 52, inProgress: 15, needed: 57, total: 124 };

  it("is short by what no term covers yet", () => {
    let fall = emptyPlan("202736", "Fall 2027");
    fall = addCourse(fall, course("x", null, { credits: 3 }), NOW);
    expect(projectedFinish(totals, [fall], new Set())).toEqual({
      counted: 70,
      onTrack: false,
      shortBy: 54,
      lastTerm: "Fall 2027",
    });
  });

  it("is on track once the plan covers the rest", () => {
    const plan = addCourse(
      emptyPlan("202803", "Spring 2028"),
      course("x", null, { credits: 57 }),
      NOW,
    );
    expect(projectedFinish(totals, [plan], new Set())).toMatchObject({
      onTrack: true,
      shortBy: 0,
      lastTerm: "Spring 2028",
    });
  });
});
