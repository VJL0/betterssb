import { describe, expect, it } from "vitest";
import type { Audit, Requirement } from "../types/dars";
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
    complete: false,
    requirements,
  };
}

const credits = (n: number) => ({ credits: n, courses: null, gpa: null });

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
          subrequirements: [
            {
              number: "1",
              title: "",
              status: "incomplete",
              earned: null,
              inProgress: null,
              needs: null,
              courses: [],
              selectFrom: ["CIS 3715", "CIS 4526"],
            },
            {
              number: "2",
              title: "",
              status: "complete",
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
        options: ["CIS 3715", "CIS 4526"],
      },
    ]);
  });
});
