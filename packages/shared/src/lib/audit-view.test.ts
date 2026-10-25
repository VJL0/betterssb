import { describe, expect, it } from "vitest";
import type {
  Audit,
  AuditCourse,
  Requirement,
  SubRequirement,
} from "@workspace/api-client";
import {
  auditGroups,
  countLines,
  courseOptions,
  plannedOptions,
  requirementFor,
} from "./audit-view";

const credits = (n: number) => ({
  credits: n,
  courses: null,
  sets: null,
  subrequirements: null,
  gpa: null,
});

function course(code: string, inProgress = false): AuditCourse {
  return {
    term: "FA26",
    course: code,
    title: "",
    credits: 4,
    grade: inProgress ? "RG" : "A",
    inProgress,
    conditionCode: "",
    notes: [],
    transfer: false,
    exception: false,
    bannerTerm: "",
    transferInstitution: "",
    transferCourse: "",
    satisfies: "",
  };
}

function sub(overrides: Partial<SubRequirement>): SubRequirement {
  return {
    number: "1",
    title: "Line",
    notes: [],
    status: "incomplete",
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
    courses: [],
    selectFrom: [],
    ...overrides,
  };
}

function requirement(overrides: Partial<Requirement>): Requirement {
  return {
    code: "R",
    category: "MAJOR",
    title: "Major requirements",
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
    subrequirements: [],
    ...overrides,
  };
}

const audit: Audit = {
  studentName: "",
  programTitle: "BS Computer Science",
  programCode: "CS",
  catalogYear: "Fall 2024",
  preparedOn: "10/12/2026",
  graduationDate: "",
  analysisComplete: true,
  degreeTotals: null,
  categoryTotals: [],
  complete: false,
  requirements: [
    requirement({ code: "WARNING", title: "", notes: ["Not definitive"] }),
    requirement({
      code: "MAJOR",
      requiredCredits: null,
      requiredGpa: null,
      requiredSubrequirements: null,
      requiredCount: null,
      maxCredits: null,
      subrequirements: [
        sub({
          number: "1",
          title: "Intro",
          notes: [],
          status: "complete",
          courses: [course("CIS  1051")],
          earned: credits(4),
        }),
        sub({
          number: "2",
          title: "Software Design",
          notes: [],
          status: "in_progress",
          courses: [course("CIS 3296", true)],
        }),
        sub({
          number: "3",
          title: "Writing intensive",
          notes: [],
          status: "incomplete",
          selectFrom: ["CIS 4397", "CIS 4398", "CIS 3000-4999"],
          needs: credits(4),
        }),
        sub({ number: "4", title: "Note", status: "none" }),
      ],
    }),
    requirement({
      code: "GPA",
      title: "Minimum GPA",
      status: "complete",
    }),
    requirement({
      code: "TOTAL",
      category: "Total_Hours",
      title: "Total hours",
      earned: credits(52),
    }),
  ],
};

describe("auditGroups", () => {
  it("groups lines by requirement, skipping notes and totals", () => {
    const groups = auditGroups(audit);
    expect(groups.map((g) => [g.code, g.lines.length, g.done])).toEqual([
      ["MAJOR", 3, 1],
      ["GPA", 1, 1],
    ]);
    expect(groups[0]!.lines.map((l) => [l.title, l.status, l.credits])).toEqual(
      [
        ["Intro", "done", "4/4"],
        ["Software Design", "progress", null],
        ["Writing intensive", "needed", "0/4"],
      ],
    );
    expect(countLines(groups)).toEqual({
      all: 4,
      done: 2,
      progress: 1,
      needed: 1,
    });
  });
});

describe("options", () => {
  it("keeps real course codes and finds those already planned", () => {
    const line = auditGroups(audit)[0]!.lines[2]!;
    expect(courseOptions(line.options)).toEqual(["CIS 4397", "CIS 4398"]);
    expect(plannedOptions(line, new Set(["CIS4398"]))).toEqual(["CIS 4398"]);
  });
});

describe("requirementFor", () => {
  it("names the line a course was applied to", () => {
    expect(requirementFor(audit, "CIS 1051")).toBe("Intro");
    expect(requirementFor(audit, "MATH 1041")).toBeNull();
  });
});
