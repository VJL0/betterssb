import { describe, expect, it } from "vitest";
import type { Audit, Requirement } from "@workspace/api-client";
import { creditTotals, neededRequirements } from "./dars";

function requirement(overrides: Partial<Requirement>): Requirement {
  return {
    code: "R",
    category: "Major",
    title: "Requirement",
    status: "complete",
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

function audit(requirements: Requirement[]): Audit {
  return {
    studentName: "",
    programTitle: "BS Computer Science",
    programCode: "",
    catalogYear: "2024",
    preparedOn: "",
    graduationDate: "",
    analysisComplete: true,
    degreeTotals: null,
    categoryTotals: [],
    complete: false,
    requirements,
  };
}

const credits = (n: number) => ({
  credits: n,
  courses: null,
  sets: null,
  subrequirements: null,
  gpa: null,
});

describe("creditTotals", () => {
  it("reads the Total_Hours line", () => {
    const totals = creditTotals(
      audit([
        requirement({
          category: "Total_Hours",
          earned: credits(52),
          inProgress: credits(15),
          needs: credits(57),
        }),
      ]),
    );
    expect(totals).toEqual({
      earned: 52,
      inProgress: 15,
      needed: 57,
      total: 124,
    });
  });

  it("is null without totals", () => {
    expect(creditTotals(audit([]))).toBeNull();
  });
});

describe("neededRequirements", () => {
  it("lists incomplete requirements with their open options", () => {
    const needed = neededRequirements(
      audit([
        requirement({ code: "A", status: "complete" }),
        requirement({
          code: "B",
          title: "Major electives",
          status: "incomplete",
          needs: credits(9),
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
              selectFrom: ["CIS 3715", "CIS 4526"],
            },
            {
              number: "2",
              title: "",
              notes: [],
              status: "complete",
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
              selectFrom: ["CIS 9999"],
            },
          ],
        }),
        requirement({
          code: "T",
          category: "Total_Hours",
          status: "incomplete",
        }),
      ]),
    );
    expect(needed).toEqual([
      {
        code: "B",
        title: "Major electives",
        credits: 9,
        courses: null,
        options: ["CIS 3715", "CIS 4526"],
        parts: [
          {
            title: "",
            credits: null,
            courses: null,
            options: ["CIS 3715", "CIS 4526"],
          },
        ],
      },
    ]);
  });
});
