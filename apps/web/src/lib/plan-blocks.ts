import { planCourseColor } from "@workspace/shared/lib/plan";
import { isSupportScheduleType } from "@workspace/shared/lib/sections";
import type { PlannedSection, TermPlan } from "@workspace/shared/types/store";
import type {
  UnscheduledSection,
  WeekCalendarBlock,
} from "@workspace/ui/components/week-calendar";

interface BlockOptions {
  ghost?: boolean;
  /** Instructor rating to flag a low one on the block. */
  ratingFor?: (section: PlannedSection) => number | null | undefined;
}

/** Calendar blocks for planned sections, one per timed meeting. */
export function sectionBlocks(
  sections: readonly PlannedSection[],
  plan: TermPlan,
  { ghost = false, ratingFor }: BlockOptions = {},
): WeekCalendarBlock[] {
  return sections.flatMap((section) =>
    section.meetings.flatMap((meeting, index) => {
      if (meeting.start === null || meeting.end === null || !meeting.days) {
        return [];
      }
      return [
        {
          id: `${ghost ? "ghost-" : ""}${section.crn}-${index}`,
          days: meeting.days,
          start: meeting.start,
          end: meeting.end,
          code: section.courseCode,
          section: section.section,
          title: section.title,
          location: meeting.location || undefined,
          kind: section.scheduleType,
          appearance: isSupportScheduleType(section.scheduleType)
            ? ("tint" as const)
            : ("solid" as const),
          color: planCourseColor(plan, section.courseId),
          ghost,
          rating: ratingFor?.(section),
        },
      ];
    }),
  );
}

/** Planned sections with no meeting time, for the calendar's tray. */
export function unscheduledSections(
  sections: readonly PlannedSection[],
): UnscheduledSection[] {
  return sections
    .filter((s) => s.meetings.every((m) => m.start === null || !m.days))
    .map((s) => ({
      id: s.crn,
      code: s.courseCode,
      section: s.section,
      title: s.title,
      note: "No set meeting time",
    }));
}
