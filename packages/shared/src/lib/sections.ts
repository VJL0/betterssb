import type { ClassMeetingTime, ClassSection } from "../types/classes";
import type { Section } from "../types/index";

type DayFlags = Pick<
  ClassMeetingTime,
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday"
>;

/**
 * The section fields these helpers read. Both a full Banner `SSBSection`
 * (from the extension) and the API's `ClassSection` fit.
 */
export type SectionSource = Pick<
  ClassSection,
  | "courseReferenceNumber"
  | "subjectCourse"
  | "termDesc"
  | "scheduleTypeDescription"
  | "seatsAvailable"
  | "maximumEnrollment"
  | "faculty"
> & { meetingsFaculty: { meetingTime: ClassMeetingTime }[] };

// A combined "Lecture and Lab" section is the main meeting, so only a type
// that starts with one of these counts as a support component.
const SUPPORT_SCHEDULE_TYPE = /^(lab|laboratory|recitation|discussion)\b/i;

/** Labs, recitations and discussions: the parts that go with a lecture. */
export function isSupportScheduleType(scheduleType: string): boolean {
  return SUPPORT_SCHEDULE_TYPE.test(scheduleType);
}

/** Banner meeting days as one letter each, in week order (R = Thursday, U = Sunday). */
export function meetingTimeToDays(mt: DayFlags): string {
  let days = "";
  if (mt.monday) days += "M";
  if (mt.tuesday) days += "T";
  if (mt.wednesday) days += "W";
  if (mt.thursday) days += "R";
  if (mt.friday) days += "F";
  if (mt.saturday) days += "S";
  if (mt.sunday) days += "U";
  return days;
}

/** Banner sends times as "HHMM"; the schedule API expects "HH:MM". */
export function formatBannerTime(raw: string): string {
  if (raw.length === 4) return `${raw.slice(0, 2)}:${raw.slice(2)}`;
  return raw;
}

export function primaryInstructorName(
  ssb: Pick<SectionSource, "faculty">,
): string {
  return (
    ssb.faculty.find((f) => f.primaryIndicator)?.displayName ??
    ssb.faculty[0]?.displayName ??
    "TBA"
  );
}

/**
 * Converts a Banner section into schedule-builder entries, one per meeting
 * block. Blocks of one CRN are kept together by the generator, and
 * `scheduleType` keeps a lab separate from its lecture. Blocks with no days or
 * times (online, TBA) are left out because they can't be placed on a week.
 */
export function ssbSectionToInternal(ssb: SectionSource): Section[] {
  const instructor = primaryInstructorName(ssb);

  return ssb.meetingsFaculty.flatMap(({ meetingTime: mt }) => {
    const days = meetingTimeToDays(mt);
    if (!days || !mt.beginTime || !mt.endTime) return [];
    return [
      {
        crn: ssb.courseReferenceNumber,
        courseId: ssb.subjectCourse,
        instructor,
        days,
        startTime: formatBannerTime(mt.beginTime),
        endTime: formatBannerTime(mt.endTime),
        location: `${mt.buildingDescription ?? ""} ${mt.room ?? ""}`.trim(),
        seatsAvailable: ssb.seatsAvailable,
        maxSeats: ssb.maximumEnrollment,
        term: ssb.termDesc,
        scheduleType: ssb.scheduleTypeDescription,
      },
    ];
  });
}
