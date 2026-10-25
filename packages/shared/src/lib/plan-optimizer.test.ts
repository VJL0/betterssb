import { describe, expect, it } from "vitest";
import type { TermPlan } from "../types/store";
import type { NeededRequirement } from "./dars";
import { addCourse, emptyPlan } from "./plan";
import {
  DEFAULT_PLAN_PREFERENCES,
  applyOptimization,
  optimizePlan,
  optimizerCourses,
  requirementParts,
  type CatalogCourse,
  type OptimizeInput,
} from "./plan-optimizer";

const NOW = "2026-10-25T12:00:00.000Z";

const CATALOG: Record<string, CatalogCourse> = {
  "CIS 2168": {
    title: "Data Structures",
    credits: 4,
    prerequisites: ["CIS 1068"],
  },
  "CIS 2107": {
    title: "Computer Systems",
    credits: 4,
    prerequisites: ["CIS 2168"],
  },
  "CIS 4398": { title: "Projects", credits: 4, prerequisites: ["CIS 2107"] },
  "ENG 1002": { title: "Analytical Reading", credits: 4, prerequisites: [] },
  "CIS 3207": {
    title: "Operating Systems",
    credits: 4,
    prerequisites: ["CIS 9999"],
  },
  "CIS 3223": { title: "Algorithms", credits: 4, prerequisites: [] },
};

function requirement(
  code: string,
  options: string[],
  overrides: Partial<NeededRequirement> = {},
): NeededRequirement {
  return {
    code,
    title: code,
    credits: 4,
    courses: null,
    options,
    parts: [],
    ...overrides,
  };
}

const SPRING = emptyPlan("202703", "Spring 2027");
const FALL = emptyPlan("202736", "Fall 2027");

function input(overrides: Partial<OptimizeInput> = {}): OptimizeInput {
  return {
    requirements: [
      requirement("GENED", ["ENG 1002"]),
      requirement("CAP", ["CIS 4398"]),
      requirement("SYS", ["CIS 2107"]),
      requirement("DS", ["CIS 2168"]),
    ],
    plans: [SPRING, FALL],
    firstTerm: "202703",
    catalog: (code) => CATALOG[code] ?? null,
    completed: new Set(["CIS1068"]),
    preferences: DEFAULT_PLAN_PREFERENCES,
    ...overrides,
  };
}

function byTerm(result: ReturnType<typeof optimizePlan>) {
  const terms: Record<string, (string | null)[]> = {};
  for (const p of result.placements) {
    (terms[p.term] ??= []).push(p.course.course.code);
  }
  return terms;
}

describe("optimizerCourses", () => {
  it("ranks by the chain a course starts and what it unlocks", () => {
    const courses = optimizerCourses(input());
    expect(courses.map((c) => [c.key, c.chain, c.unlocks])).toEqual([
      ["CIS2168", 3, 2],
      ["CIS2107", 2, 1],
      ["ENG1002", 1, 0],
      ["CIS4398", 1, 0],
    ]);
    expect(courses[0]!.course).toEqual({
      code: "CIS 2168",
      title: "Data Structures",
      credits: 4,
      requirement: "DS",
    });
  });

  it("takes the student's pick, else the option with the fewest prerequisites left", () => {
    const options = [requirement("UPPER", ["CIS 3207", "CIS 3223"])];
    expect(optimizerCourses(input({ requirements: options }))[0]!.key).toBe(
      "CIS3223",
    );
    const picked = optimizerCourses(
      input({
        requirements: options,
        preferences: {
          ...DEFAULT_PLAN_PREFERENCES,
          choices: { "UPPER#0": "CIS 3207" },
        },
      }),
    );
    expect(picked[0]!.key).toBe("CIS3207");
  });

  it("splits a requirement of several courses, naming slots without options", () => {
    const courses = optimizerCourses(
      input({
        requirements: [
          requirement("ELECT", ["CIS 4@"], { title: "Electives", credits: 9 }),
        ],
      }),
    );
    expect(courses.map((c) => c.course)).toEqual(
      Array.from({ length: 3 }, () => ({
        code: null,
        title: "Electives",
        credits: 3,
        requirement: "ELECT",
      })),
    );
  });

  it("leaves out courses taken or already planned", () => {
    const planned = addCourse(
      SPRING,
      {
        id: "a",
        code: "ENG 1002",
        title: "Analytical Reading",
        credits: 4,
        requirement: null,
        addedAt: NOW,
      },
      NOW,
    );
    const keys = optimizerCourses(
      input({ plans: [planned, FALL], completed: new Set(["CIS2168"]) }),
    ).map((c) => c.key);
    // A requirement whose only course is taken or planned keeps a placeholder.
    expect(keys).toEqual(["CIS2107", "CIS4398", "GENED#0:0", "DS#0:0"]);
  });
});

describe("requirementParts", () => {
  it("plans each incomplete part of a requirement on its own", () => {
    const major = requirement("MAJOR", [], {
      title: "Major",
      credits: null,
      parts: [
        {
          title: "Capstone",
          credits: null,
          courses: 1,
          options: ["CIS 4397", "CIS 4398"],
        },
        {
          title: "CIS electives",
          credits: 8,
          courses: null,
          options: ["CIS 3100", "CIS 2000-4999"],
        },
      ],
    });
    expect(requirementParts(major)).toEqual([
      {
        key: "MAJOR#0",
        title: "Capstone",
        credits: null,
        courses: 1,
        options: ["CIS 4397", "CIS 4398"],
      },
      {
        key: "MAJOR#1",
        title: "CIS electives",
        credits: 8,
        courses: null,
        options: ["CIS 3100"],
      },
    ]);
    const courses = optimizerCourses(input({ requirements: [major] }));
    expect(
      courses.map((c) => [c.part, c.course.code, c.course.credits]),
    ).toEqual([
      ["MAJOR#1", "CIS 3100", 3],
      ["MAJOR#0", "CIS 4397", 3],
      ["MAJOR#1", null, 3],
      ["MAJOR#1", null, 2],
    ]);
  });

  it("gives a lone part without a count the requirement's", () => {
    const upper = requirement("ULS", [], {
      credits: 5,
      parts: [
        {
          title: "Upper level",
          credits: null,
          courses: null,
          options: ["CST 2000-4999"],
        },
      ],
    });
    expect(requirementParts(upper)[0]).toMatchObject({
      credits: 5,
      options: [],
    });
  });

  it("leaves out requirements the student skips", () => {
    const courses = optimizerCourses(
      input({
        preferences: {
          ...DEFAULT_PLAN_PREFERENCES,
          priorities: { GENED: "skip" },
        },
      }),
    );
    expect(courses.map((c) => c.key)).not.toContain("ENG1002");
  });
});

describe("optimizePlan", () => {
  it("puts prerequisites in earlier terms and adds terms when the plan runs out", () => {
    const result = optimizePlan(input());
    expect(byTerm(result)).toEqual({
      "202703": ["CIS 2168", "ENG 1002"],
      "202736": ["CIS 2107"],
      "202803": ["CIS 4398"],
    });
    expect(result.newTerms).toEqual([{ code: "202803", name: "Spring 2028" }]);
    expect(result.unplaced).toEqual([]);
  });

  it("fills terms the plan skipped", () => {
    const spring2028 = emptyPlan("202803", "Spring 2028");
    const result = optimizePlan(input({ plans: [SPRING, spring2028] }));
    expect(byTerm(result)).toEqual({
      "202703": ["CIS 2168", "ENG 1002"],
      "202736": ["CIS 2107"],
      "202803": ["CIS 4398"],
    });
    expect(result.newTerms).toEqual([{ code: "202736", name: "Fall 2027" }]);
  });

  it("fills a term with high priority courses first", () => {
    const result = optimizePlan(
      input({
        preferences: {
          ...DEFAULT_PLAN_PREFERENCES,
          creditsPerTerm: 4,
          priorities: { GENED: "high" },
        },
      }),
    );
    expect(byTerm(result)).toEqual({
      "202703": ["ENG 1002"],
      "202736": ["CIS 2168"],
      "202803": ["CIS 2107"],
      "202836": ["CIS 4398"],
    });
  });

  it("uses summer terms only when asked", () => {
    const summer = emptyPlan("202720", "Summer I 2027");
    const plans = [SPRING, summer, FALL];
    expect(byTerm(optimizePlan(input({ plans })))["202720"]).toBeUndefined();
    const withSummers = optimizePlan(
      input({
        plans,
        preferences: { ...DEFAULT_PLAN_PREFERENCES, includeSummers: true },
      }),
    );
    expect(byTerm(withSummers)["202720"]).toEqual(["CIS 2107"]);
  });

  it("counts credits already in a term", () => {
    const busy: TermPlan = addCourse(
      SPRING,
      {
        id: "x",
        code: null,
        title: "Elective",
        credits: 11,
        requirement: null,
        addedAt: NOW,
      },
      NOW,
    );
    expect(
      byTerm(optimizePlan(input({ plans: [busy, FALL] })))["202703"],
    ).toEqual(["CIS 2168"]);
  });

  it("waits for a prerequisite already planned", () => {
    const planned = addCourse(
      FALL,
      {
        id: "a",
        code: "CIS 2168",
        title: "Data Structures",
        credits: 4,
        requirement: null,
        addedAt: NOW,
      },
      NOW,
    );
    const result = optimizePlan(
      input({
        requirements: [requirement("SYS", ["CIS 2107"])],
        plans: [SPRING, planned],
      }),
    );
    expect(byTerm(result)).toEqual({ "202803": ["CIS 2107"] });
  });

  it("leaves courses whose prerequisites loop unplaced", () => {
    const loop: Record<string, CatalogCourse> = {
      "CIS 1001": { title: "A", credits: 3, prerequisites: ["CIS 1002"] },
      "CIS 1002": { title: "B", credits: 3, prerequisites: ["CIS 1001"] },
    };
    const result = optimizePlan(
      input({
        requirements: [
          requirement("A", ["CIS 1001"]),
          requirement("B", ["CIS 1002"]),
        ],
        catalog: (code) => loop[code] ?? null,
      }),
    );
    expect(result.placements).toEqual([]);
    expect(result.newTerms).toEqual([]);
    expect(result.unplaced.map((c) => c.key).sort()).toEqual([
      "CIS1001",
      "CIS1002",
    ]);
  });
});

describe("applyOptimization", () => {
  it("adds courses to existing terms and creates new ones", () => {
    const changed = applyOptimization(
      [SPRING, FALL],
      optimizePlan(input()),
      NOW,
    );
    expect(changed.map((p) => [p.term, p.courses.map((c) => c.code)])).toEqual([
      ["202703", ["CIS 2168", "ENG 1002"]],
      ["202736", ["CIS 2107"]],
      ["202803", ["CIS 4398"]],
    ]);
    expect(changed[2]!.termDescription).toBe("Spring 2028");
  });
});
