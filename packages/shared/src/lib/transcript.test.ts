import { describe, expect, it } from "vitest";
import type { AcademicTranscript } from "@workspace/api-client";
import { sampleTranscriptPage } from "../testing/academic-transcript";
import {
  bannerTranscript,
  isAcademicTranscriptPageData,
  savedTranscript,
  transcriptTerms,
} from "./transcript";

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
  it("keeps courses, what decides their GPA hours, and the GPA, with terms named season first", () => {
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
          category: "institution",
          repeat: null,
        },
        {
          subject: "CIS",
          courseNumber: "2168",
          title: "Data Structures",
          grade: "B",
          credits: 4,
          term: "Spring 2025",
          category: "institution",
          repeat: null,
        },
      ],
    });
    expect(transcriptTerms(saved).map((term) => term.term)).toEqual([
      "Spring 2025",
      "Fall 2024",
    ]);
  });
});

describe("bannerTranscript", () => {
  it("keeps Temple, transfer and in-progress courses and the overall GPA", () => {
    expect(bannerTranscript(sampleTranscriptPage())).toEqual({
      gpa: 3.5,
      courses: [
        {
          subject: "CIS",
          courseNumber: "1051",
          title: "Intro to Problem Solving",
          grade: "A",
          credits: 4,
          term: "Fall 2024",
          category: "institution",
          repeat: null,
        },
        {
          subject: "ENG",
          courseNumber: "0802",
          title: "Analytical Reading & Writing",
          grade: "B",
          credits: 4,
          term: "Fall 2024",
          category: "institution",
          repeat: null,
        },
        {
          subject: "MATH",
          courseNumber: "1041",
          title: "Calculus I",
          grade: "TR",
          credits: 4,
          term: "Spring,24",
          category: "transfer",
          repeat: null,
        },
        {
          subject: "CIS",
          courseNumber: "2168",
          title: "Data Structures",
          grade: "",
          credits: 4,
          term: "Spring 2025",
          category: "in_progress",
          repeat: null,
        },
      ],
    });
  });

  it("keeps Banner's repeat flag and the long title when there's no short one", () => {
    const page = sampleTranscriptPage();
    page.institutionCredit["202436"]![0]!.subjectGrid = [
      {
        ...page.institutionCredit["202436"]![0]!.subjectGrid[0]!,
        title: [null, "Introduction to Problem Solving"],
        r: "E",
      },
    ];
    const [course] = bannerTranscript(page).courses;
    expect(course).toMatchObject({
      title: "Introduction to Problem Solving",
      repeat: "E",
    });
  });

  it("has no GPA without an Overall row", () => {
    const page = sampleTranscriptPage();
    page.totalTranscript = [];
    expect(bannerTranscript(page).gpa).toBeNull();
  });

  it("fails on credit hours that aren't a number", () => {
    const page = sampleTranscriptPage();
    page.courseInProgress["202503"]![0]!.subjectGrid[0]!.creditHours = "";
    expect(() => bannerTranscript(page)).toThrow(
      `Banner's transcript has "" where a number goes.`,
    );
  });
});

describe("isAcademicTranscriptPageData", () => {
  it("accepts Self-Service's transcript data", () => {
    expect(isAcademicTranscriptPageData(sampleTranscriptPage())).toBe(true);
  });

  it.each([
    ["an empty answer", []],
    [
      "an answer without transfer credit",
      { ...sampleTranscriptPage(), viewtransferCreditData: null },
    ],
    [
      "an answer without totals",
      { ...sampleTranscriptPage(), totalTranscript: {} },
    ],
  ])("rejects %s", (_name, value) => {
    expect(isAcademicTranscriptPageData(value)).toBe(false);
  });
});
