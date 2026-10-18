import type {
  PlannedCourse,
  PlannedMeeting,
  PlannedSection,
  TermPlan,
} from "../types/store";
import {
  assignCourseColorOrder,
  courseColor,
  type CourseColor,
} from "./course-colors";
import {
  formatTimeRange,
  parseClockTime,
  parseDays,
  type WeekDay,
} from "./meeting-times";
import { meetingTimeToDays, primaryInstructorName } from "./sections";
import type { ClassSection } from "@workspace/api-client";

export function emptyPlan(term: string, termDescription: string): TermPlan {
  return {
    term,
    termDescription,
    sections: [],
    courses: [],
    colorOrder: {},
    updatedAt: new Date(0).toISOString(),
  };
}

/**
 * The key a course's color is stored under: Banner's subjectCourse form
 * ("CIS2168"), so a planned course "CIS 2168" and its sections share a color.
 */
export function courseKey(code: string): string {
  return code.replace(/\s+/g, "").toUpperCase();
}

/** "CIS" + "2168" → "CIS 2168". */
export function courseCode(subject: string, courseNumber: string): string {
  return `${subject} ${courseNumber}`;
}

/** "CIS 2168" → { subject: "CIS", courseNumber: "2168" }; null if it isn't a course code. */
export function splitCourseCode(
  code: string,
): { subject: string; courseNumber: string } | null {
  const match = /^([A-Z&]{2,6})\s*(\d{3,4}[A-Z]?)$/i.exec(code.trim());
  if (!match) return null;
  return {
    subject: match[1]!.toUpperCase(),
    courseNumber: match[2]!.toUpperCase(),
  };
}

function toMinutes(time: string | null): number | null {
  if (!time) return null;
  const minutes = parseClockTime(time);
  return Number.isNaN(minutes) ? null : minutes;
}

function location(building: string | null, room: string | null): string {
  return [building, room].filter(Boolean).join(" ").trim();
}

/** What the plan keeps about a Banner section. */
export function plannedSectionFrom(
  section: ClassSection,
  addedAt: string,
): PlannedSection {
  const meetings: PlannedMeeting[] = section.meetingsFaculty.map(
    ({ meetingTime: mt }) => ({
      days: meetingTimeToDays(mt),
      start: toMinutes(mt.beginTime),
      end: toMinutes(mt.endTime),
      location: location(mt.buildingDescription, mt.room),
      startDate: mt.startDate,
      endDate: mt.endDate,
    }),
  );
  return {
    crn: section.courseReferenceNumber,
    courseId: section.subjectCourse,
    courseCode: courseCode(section.subject, section.courseNumber),
    section: section.sequenceNumber,
    title: section.courseTitle,
    credits: section.creditHourLow ?? section.creditHours,
    scheduleType: section.scheduleTypeDescription,
    instructor: primaryInstructorName(section),
    meetings,
    addedAt,
  };
}

function touch(
  plan: TermPlan,
  changes: Partial<TermPlan>,
  now: string,
): TermPlan {
  const next = { ...plan, ...changes, updatedAt: now };
  const courseIds = [
    ...new Set([
      ...next.sections.map((s) => s.courseId),
      ...next.courses.map((c) => (c.code ? courseKey(c.code) : c.id)),
    ]),
  ];
  return {
    ...next,
    colorOrder: assignCourseColorOrder(courseIds, plan.colorOrder),
  };
}

export function addSection(
  plan: TermPlan,
  section: PlannedSection,
  now: string,
): TermPlan {
  if (plan.sections.some((s) => s.crn === section.crn)) return plan;
  return touch(plan, { sections: [...plan.sections, section] }, now);
}

export function removeSection(
  plan: TermPlan,
  crn: string,
  now: string,
): TermPlan {
  return touch(
    plan,
    { sections: plan.sections.filter((s) => s.crn !== crn) },
    now,
  );
}

/** Replaces every section, e.g. with a generated schedule. Course entries stay. */
export function replaceSections(
  plan: TermPlan,
  sections: PlannedSection[],
  now: string,
): TermPlan {
  return touch(plan, { sections }, now);
}

export function addCourse(
  plan: TermPlan,
  course: PlannedCourse,
  now: string,
): TermPlan {
  return touch(plan, { courses: [...plan.courses, course] }, now);
}

export function removeCourse(
  plan: TermPlan,
  id: string,
  now: string,
): TermPlan {
  return touch(plan, { courses: plan.courses.filter((c) => c.id !== id) }, now);
}

/** The color a course has in this plan, or null if it isn't in the plan. */
export function planCourseColor(
  plan: TermPlan,
  courseId: string,
): CourseColor | null {
  const order = plan.colorOrder[courseId];
  return order === undefined ? null : courseColor(order);
}

/**
 * Credits planned for the term. A course counts once even with several
 * sections (a lecture and its lab), using its highest-credit section, and a
 * planned course that already has a section isn't counted again.
 */
export function planCredits(plan: TermPlan): number {
  const byCourse = new Map<string, number>();
  for (const s of plan.sections) {
    byCourse.set(
      s.courseId,
      Math.max(byCourse.get(s.courseId) ?? 0, s.credits ?? 0),
    );
  }
  const sectionCredits = [...byCourse.values()].reduce((a, b) => a + b, 0);
  const courseCredits = plan.courses
    .filter((c) => !c.code || !byCourse.has(courseKey(c.code)))
    .reduce((a, c) => a + (c.credits ?? 0), 0);
  return sectionCredits + courseCredits;
}

export interface PlanConflict {
  a: PlannedSection;
  b: PlannedSection;
  day: string;
  start: number;
  end: number;
}

/** Where two sections' meetings overlap: the shared days and the overlapping minutes. */
export interface MeetingOverlap {
  days: WeekDay[];
  start: number;
  end: number;
}

type HasMeetings = Pick<PlannedSection, "meetings">;

/** Pairs of planned sections whose meetings overlap. */
export function planConflicts(
  sections: readonly PlannedSection[],
): PlanConflict[] {
  const conflicts: PlanConflict[] = [];
  for (let i = 0; i < sections.length; i++) {
    for (let j = i + 1; j < sections.length; j++) {
      const a = sections[i]!;
      const b = sections[j]!;
      const clash = sectionOverlap(a, b);
      if (clash) {
        conflicts.push({
          a,
          b,
          day: clash.days[0]!,
          start: clash.start,
          end: clash.end,
        });
      }
    }
  }
  return conflicts;
}

/** A section from outside the plan, such as a row on a Banner page. */
export interface OutsideSection extends Pick<
  PlannedSection,
  "crn" | "meetings"
> {
  /** Null when the page doesn't say which course the section is. */
  courseCode: string | null;
}

export interface PlanClash {
  planned: PlannedSection;
  overlap: MeetingOverlap;
}

/**
 * The planned sections a section would clash with if it were added. A
 * section already in the plan clashes with nothing new, and other sections
 * of its own course are alternatives to it, not clashes.
 */
export function clashesWithPlan(
  section: OutsideSection,
  planned: readonly PlannedSection[],
): PlanClash[] {
  if (planned.some((p) => p.crn === section.crn)) return [];
  return planned.flatMap((p) => {
    if (section.courseCode && p.courseCode === section.courseCode) return [];
    const overlap = sectionOverlap(section, p);
    return overlap ? [{ planned: p, overlap }] : [];
  });
}

/** The first pair of meetings, one from each section, that overlap. */
export function sectionOverlap(
  a: HasMeetings,
  b: HasMeetings,
): MeetingOverlap | null {
  for (const ma of a.meetings) {
    for (const mb of b.meetings) {
      if (
        ma.start === null ||
        ma.end === null ||
        mb.start === null ||
        mb.end === null
      )
        continue;
      const otherDays = parseDays(mb.days);
      const days = parseDays(ma.days).filter((d) => otherDays.includes(d));
      if (days.length > 0 && ma.start < mb.end && mb.start < ma.end) {
        return {
          days,
          start: Math.max(ma.start, mb.start),
          end: Math.min(ma.end, mb.end),
        };
      }
    }
  }
  return null;
}

/** "TR 9:30–10:50 AM · W 1:00–2:50 PM", or "No set time" for online or TBA sections. */
export function describeMeetings(section: HasMeetings): string {
  const timed = section.meetings.filter(
    (m) => m.start !== null && m.end !== null && m.days,
  );
  if (timed.length === 0) return "No set time";
  return timed
    .map((m) => `${m.days} ${formatTimeRange(m.start!, m.end!)}`)
    .join(" · ");
}
