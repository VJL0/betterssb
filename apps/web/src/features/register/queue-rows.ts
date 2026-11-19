import type { SectionSummary } from "@workspace/api-client";
import { courseCode } from "@workspace/shared/lib/plan";
import type { SSBRegPlanHeader } from "@workspace/shared/types/ssb";
import type { TermPlan } from "@workspace/shared/types/store";

export interface QueueRow {
  crn: string;
  /** "CIS 2168", once a plan or Banner names the CRN. */
  code: string | null;
  /** Banner's subjectCourse ("CIS2168"), for course colors and seats. */
  courseId: string | null;
  title: string | null;
  section: string | null;
  credits: number | null;
}

/**
 * The queued CRNs, described from the student's saved plans for the term,
 * or from a Banner plan when that's where they came from. A typed-in CRN
 * that neither names is left for `withLookedUp`.
 */
export function queueRows(
  crns: readonly string[],
  term: string,
  plans: readonly TermPlan[],
  bannerPlans: readonly SSBRegPlanHeader[] = [],
): QueueRow[] {
  const planned = new Map(
    plans
      .filter((p) => p.term === term)
      .flatMap((p) => p.sections.map((s) => [s.crn, s] as const)),
  );
  const banner = new Map(
    bannerPlans
      .filter((p) => p.term === term)
      .flatMap((p) =>
        p.planCourses.map((c) => [c.courseReferenceNumber, c] as const),
      ),
  );
  return crns.map((crn) => {
    const section = planned.get(crn);
    if (section) {
      return {
        crn,
        code: section.courseCode,
        courseId: section.courseId,
        title: section.title,
        section: section.section,
        credits: section.credits,
      };
    }
    const course = banner.get(crn);
    if (course) {
      return {
        crn,
        code: courseCode(course.subject, course.courseNumber),
        courseId: `${course.subject}${course.courseNumber}`,
        title: course.courseTitle,
        section: course.section,
        credits: course.creditHours,
      };
    }
    return {
      crn,
      code: null,
      courseId: null,
      title: null,
      section: null,
      credits: null,
    };
  });
}

/**
 * Fills in the rows no plan names from Banner's section lookup by CRN, so
 * every queued section shows its course.
 */
export function withLookedUp(
  rows: readonly QueueRow[],
  lookedUp: ReadonlyMap<string, SectionSummary>,
): QueueRow[] {
  return rows.map((row) => {
    const found = row.title === null ? lookedUp.get(row.crn) : undefined;
    if (!found) return row;
    const { subject, courseNumber } = found;
    return {
      ...row,
      code: courseCode(subject, courseNumber),
      courseId: `${subject}${courseNumber}`,
      title: found.title,
      section: found.section,
    };
  });
}

/** Credits for the queue, counting a course once (a lecture and its lab). */
export function queueCredits(rows: readonly QueueRow[]): number {
  const byCourse = new Map<string, number>();
  for (const row of rows) {
    if (!row.courseId || row.credits === null) continue;
    byCourse.set(
      row.courseId,
      Math.max(byCourse.get(row.courseId) ?? 0, row.credits),
    );
  }
  return [...byCourse.values()].reduce((a, b) => a + b, 0);
}
