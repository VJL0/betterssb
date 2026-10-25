import { describe, expect, it } from "vitest";
import type { AcademicTranscript } from "@workspace/api-client";
import { savedTranscript, transcriptTerms } from "./transcript";

const PARSED: AcademicTranscript = {
  gpa: 3.44,
  institution: "Temple University",
  program: { Minor: "Data Science" },
  periods: [],
  totals: [],
  diagnostics: [],
  courses: [
    {
      subject: "CIS",
      courseNumber: "1166",
      title: "Math Concepts in Computing I",
      grade: "A",
      credits: 4,
      term: "2024 Fall",
      category: "institution",
      qualityPoints: 16,
      repeat: null,
    },
    {
      subject: "CIS",
      courseNumber: "2168",
      title: "Data Structures",
      grade: "B",
      credits: 4,
      term: "2025 Spring",
      category: "institution",
      qualityPoints: 12,
      repeat: null,
    },
  ],
};

describe("savedTranscript", () => {
  it("keeps only courses and GPA, with terms named season first", () => {
    const saved = savedTranscript(PARSED);
    expect(saved).toEqual({
      gpa: 3.44,
      courses: [
        {
          subject: "CIS",
          courseNumber: "1166",
          title: "Math Concepts in Computing I",
          grade: "A",
          credits: 4,
          term: "Fall 2024",
        },
        {
          subject: "CIS",
          courseNumber: "2168",
          title: "Data Structures",
          grade: "B",
          credits: 4,
          term: "Spring 2025",
        },
      ],
    });
    expect(transcriptTerms(saved).map((term) => term.term)).toEqual([
      "Spring 2025",
      "Fall 2024",
    ]);
  });
});
