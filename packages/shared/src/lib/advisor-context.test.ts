import { describe, expect, it } from "vitest";
import type { Audit } from "@workspace/api-client";
import type { TranscriptData } from "./transcript";
import {
  MAX_CONTEXT_CHARS,
  advisorContext,
  auditContext,
  planContext,
  threadTitle,
  transcriptContext,
} from "./advisor-context";
import { addCourse, emptyPlan } from "./plan";
import { transcriptTerms } from "./transcript";

const NOW = "2026-10-17T12:00:00.000Z";

const transcript: TranscriptData = {
  gpa: 3.42,
  courses: [
    {
      subject: "CIS",
      courseNumber: "1051",
      title: "Intro to Problem Solving",
      grade: "A",
      credits: 4,
      term: "Spring 2026",
    },
    {
      subject: "ENG",
      courseNumber: "0802",
      title: "Analytical Reading and Writing",
      grade: "A",
      credits: 4,
      term: "Fall 2025",
    },
    {
      subject: "MATH",
      courseNumber: "1041",
      title: "Calculus I",
      grade: "A-",
      credits: 4,
      term: "Spring 2026",
    },
    {
      subject: "KINS",
      courseNumber: "1101",
      title: "Fitness Walking",
      grade: "A",
      credits: 2,
      term: "Transfer",
    },
  ],
};

describe("transcriptTerms", () => {
  it("groups by term, newest first, with undated terms last", () => {
    expect(
      transcriptTerms(transcript).map((t) => [
        t.term,
        t.courses.length,
        t.credits,
      ]),
    ).toEqual([
      ["Spring 2026", 2, 8],
      ["Fall 2025", 1, 4],
      ["Transfer", 1, 2],
    ]);
  });
});

describe("advisor context", () => {
  it("describes the audit's lines and what can fill the needed ones", () => {
    const audit: Audit = {
      studentName: "",
      programTitle: "BS Computer Science",
      programCode: "CS",
      catalogYear: "2024",
      preparedOn: "",
      graduationDate: "",
      analysisComplete: true,
      degreeTotals: null,
      categoryTotals: [],
      complete: false,
      requirements: [
        {
          code: "WI",
          category: "MAJOR",
          title: "Writing intensive",
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
              selectFrom: ["CIS 4398"],
            },
          ],
        },
      ],
    };
    expect(auditContext(audit, NOW)).toBe(
      [
        "Degree audit (DARS, saved 2026-10-17): BS Computer Science, 2024 catalog.",
        "Writing intensive:",
        "- Writing intensive: needed. Options: CIS 4398.",
      ].join("\n"),
    );
  });

  it("lists transcript courses and planned terms", () => {
    expect(transcriptContext(transcript).split("\n").slice(0, 3)).toEqual([
      "Transcript:",
      "Overall GPA: 3.42.",
      "- Spring 2026: CIS 1051 Intro to Problem Solving, 4 cr, grade A.",
    ]);
    const plan = addCourse(
      emptyPlan("202736", "Fall 2027"),
      {
        id: "x",
        code: "CIS 3715",
        title: "Principles of Data Science",
        credits: 3,
        requirement: null,
        addedAt: NOW,
      },
      NOW,
    );
    expect(planContext([plan, emptyPlan("202803", "Spring 2028")])).toBe(
      "Semester plan:\n- Fall 2027: CIS 3715 Principles of Data Science.",
    );
    expect(planContext([emptyPlan("202803", "Spring 2028")])).toBe("");
  });

  it("joins the parts that are on and trims very long context", () => {
    expect(advisorContext(["A", "", "B"])).toBe("A\n\nB");
    const long = advisorContext(["x".repeat(MAX_CONTEXT_CHARS + 10)]);
    expect(long.endsWith("[Trimmed to fit.]")).toBe(true);
  });
});

describe("threadTitle", () => {
  it("keeps short questions and cuts long ones at a word", () => {
    expect(threadTitle("  Can I drop MATH 1042? ")).toBe(
      "Can I drop MATH 1042?",
    );
    expect(
      threadTitle(
        "I want to focus on machine learning. Which CIS electives should I plan for?",
      ),
    ).toBe("I want to focus on machine learning. Which CIS…");
  });
});
