import { describe, expect, it } from "vitest";
import { sampleAudit } from "@workspace/shared/testing/audit";
import { takenTerms } from "./taken-terms";

const TRANSCRIPT = {
  gpa: null,
  courses: [
    {
      subject: "CIS",
      courseNumber: "1051",
      title: "Intro",
      credits: 4,
      grade: "A",
      term: "Spring 2026",
    },
    {
      subject: "ENG",
      courseNumber: "0802",
      title: "Writing",
      credits: 4,
      grade: "B",
      term: "Fall 2025",
    },
  ],
};

describe("takenTerms", () => {
  it("combines audit and transcript courses once per term in ascending order", () => {
    const audit = sampleAudit();
    audit.requirements.push(audit.requirements[1]!);
    const terms = takenTerms(audit, TRANSCRIPT);
    expect(terms.map((term) => term.term)).toEqual([
      "202536",
      "202603",
      "202636",
    ]);
    expect(terms[1]?.courses).toHaveLength(1);
    expect(terms[1]?.courses[0]).toMatchObject({
      code: "CIS 1051",
      credits: 4,
    });
  });

  it("uses Banner codes and labels in-progress terms", () => {
    const audit = sampleAudit();
    audit.requirements[1]!.subrequirements[0]!.courses[0]!.bannerTerm =
      "202520";
    expect(takenTerms(audit, null).map((term) => term.termDescription)).toEqual(
      ["Summer I 2025", "Fall 2026"],
    );
  });

  it("preserves summer records without guessing their session", () => {
    const course = TRANSCRIPT.courses[0]!;
    const terms = takenTerms(null, {
      gpa: null,
      courses: [
        { ...course, term: "Summer 2025" },
        { ...course, term: "Summer II 2025" },
      ],
    });
    expect(terms.map((term) => term.termDescription)).toEqual([
      "Summer 2025",
      "Summer II 2025",
    ]);
  });

  it("keeps repeated attempts in different terms and skips undated records", () => {
    const course = TRANSCRIPT.courses[0]!;
    const terms = takenTerms(null, {
      gpa: null,
      courses: [
        course,
        { ...course, term: "Spring 2025" },
        { ...course, term: "Transfer" },
        { ...course, term: "Fall 2026", grade: "IP" },
      ],
    });
    expect(terms.map((term) => term.term)).toEqual([
      "202503",
      "202603",
      "202636",
    ]);
    expect(terms.every((term) => term.courses.length === 1)).toBe(true);
    expect(terms[2]?.inProgress).toBe(true);
    expect(terms[0]?.inProgress).toBe(false);
    expect(takenTerms(null, null)).toEqual([]);
  });
});
