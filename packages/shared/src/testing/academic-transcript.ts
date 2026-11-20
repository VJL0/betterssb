import type {
  AcademicTranscriptPageData,
  InstitutionCourse,
} from "../types/banner/academic-transcript";

function institutionCourse(
  overrides: Partial<InstitutionCourse>,
): InstitutionCourse {
  return {
    subjectCode: "CIS",
    courseNumber: "1051",
    title: ["Intro to Problem Solving", null],
    grade: "A",
    creditHours: "4.000",
    r: null,
    ...overrides,
  };
}

/**
 * Self-Service's transcript data in the shape of the signed-in HAR, with
 * made-up courses: a Temple term, AP credit and a registered term.
 */
export function sampleTranscriptPage(): AcademicTranscriptPageData {
  return {
    hasError: false,
    institutionCredit: {
      "202436": [
        {
          infoMap: [{ period: "2024 Fall" }],
          subjectGrid: [
            institutionCourse({}),
            institutionCourse({
              subjectCode: "ENG",
              courseNumber: "0802",
              title: ["Analytical Reading & Writing", null],
              grade: "B",
            }),
          ],
        },
      ],
    },
    courseInProgress: {
      "202503": [
        {
          infoMap: [{ period: "2025 Spring" }],
          subjectGrid: [
            {
              subjectCode: "CIS",
              courseNumber: "2168",
              title: "Data Structures",
              creditHours: "4.000",
            },
          ],
        },
      ],
    },
    viewtransferCreditData: {
      transferCreditList: [
        {
          periodSeqNo: "Spring,24",
          transferCreditInfo: [
            {
              subject: "MATH",
              course: "1041",
              title: "Calculus I",
              grade: "TR",
              creditHours: "4.000",
              rVal: "",
            },
          ],
        },
      ],
    },
    totalTranscript: [
      {
        transcriptTotalsGrid: [
          { firstColumn: "Total Institution", gpa: "3.50" },
          { firstColumn: "Total Transfer", gpa: "0.00" },
          { firstColumn: "Overall", gpa: "3.50" },
        ],
      },
    ],
  };
}
