import type { Audit, Requirement } from "@workspace/api-client";

const credits = (n: number) => ({ credits: n, courses: null, gpa: null });

function requirement(overrides: Partial<Requirement>): Requirement {
  return {
    code: "R",
    category: "MAJOR",
    title: "Requirement",
    status: "incomplete",
    notes: [],
    earned: null,
    inProgress: null,
    needs: null,
    subrequirements: [],
    ...overrides,
  };
}

/** A small DARS audit: one line done, one in progress, one needed, plus totals. */
export function sampleAudit(): Audit {
  return {
    studentName: "",
    programTitle: "Computer Science BS",
    programCode: "CS",
    catalogYear: "Fall 2024",
    preparedOn: "10/12/2026 05:14 PM",
    complete: false,
    requirements: [
      requirement({ code: "WARNING", title: "", notes: ["Not definitive"] }),
      requirement({
        code: "MAJOR",
        title: "Computer Science major",
        subrequirements: [
          {
            number: "1",
            title: "Intro to Problem Solving",
            status: "complete",
            earned: credits(4),
            inProgress: null,
            needs: null,
            courses: [
              {
                term: "SP26",
                course: "CIS 1051",
                title: "Intro to Problem Solving",
                credits: 4,
                grade: "A",
                inProgress: false,
              },
            ],
            selectFrom: [],
          },
          {
            number: "2",
            title: "Software Design",
            status: "in_progress",
            earned: null,
            inProgress: credits(4),
            needs: null,
            courses: [
              {
                term: "FA26",
                course: "CIS 3296",
                title: "Software Design",
                credits: 4,
                grade: "RG",
                inProgress: true,
              },
            ],
            selectFrom: [],
          },
          {
            number: "3",
            title: "Writing intensive",
            status: "incomplete",
            earned: null,
            inProgress: null,
            needs: credits(4),
            courses: [],
            selectFrom: ["CIS 4397", "CIS 4398"],
          },
        ],
      }),
      requirement({
        code: "TOTAL",
        category: "Total_Hours",
        title: "Total hours",
        earned: credits(52),
        inProgress: credits(15),
        needs: credits(57),
      }),
    ],
  };
}
