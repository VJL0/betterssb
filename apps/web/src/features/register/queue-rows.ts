import { formatTimeRange } from "@workspace/shared/lib/meeting-times";
import { courseCode } from "@workspace/shared/lib/plan";
import type { SSBRegPlanHeader } from "@workspace/shared/types/ssb";
import type { PlannedSection, TermPlan } from "@workspace/shared/types/store";

export interface QueueRow {
  crn: string;
  /** "CIS 2168", when a plan names the CRN. */
  code: string | null;
  /** Banner's subjectCourse ("CIS2168"), for course colors and seats. */
  courseId: string | null;
  title: string | null;
  section: string | null;
  credits: number | null;
  /** "TR 9:30–10:50 AM", when the plan has meeting times. */
  meets: string | null;
}

function meetsOf(section: PlannedSection): string | null {
  const timed = section.meetings.filter(
    (m) => m.start !== null && m.end !== null && m.days,
  );
  if (timed.length === 0) return null;
  return timed
    .map((m) => `${m.days} ${formatTimeRange(m.start!, m.end!)}`)
    .join(", ");
}

/**
 * The queued CRNs, described from the student's saved plans for the term,
 * or from a Banner plan when that's where they came from. A typed-in CRN
 * that neither names is shown by number only.
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
        meets: meetsOf(section),
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
        meets: null,
      };
    }
    return {
      crn,
      code: null,
      courseId: null,
      title: null,
      section: null,
      credits: null,
      meets: null,
    };
  });
}

/** Credit hours for the queue, counting a course once (a lecture and its lab). */
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
