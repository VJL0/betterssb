import type { ClassSection, MeetingTime } from "@workspace/api-client";

const DAY_FLAGS = {
  M: "monday",
  T: "tuesday",
  W: "wednesday",
  R: "thursday",
  F: "friday",
  S: "saturday",
  U: "sunday",
} as const;

/** A meeting block as Banner sends it: days like "TR", times as "HHMM" or null. */
export function meetingTime(
  days: string,
  begin: string | null,
  end: string | null,
  overrides: Partial<MeetingTime> = {},
): MeetingTime {
  const meets = (letter: keyof typeof DAY_FLAGS) => days.includes(letter);
  const flags = {
    [DAY_FLAGS.M]: meets("M"),
    [DAY_FLAGS.T]: meets("T"),
    [DAY_FLAGS.W]: meets("W"),
    [DAY_FLAGS.R]: meets("R"),
    [DAY_FLAGS.F]: meets("F"),
    [DAY_FLAGS.S]: meets("S"),
    [DAY_FLAGS.U]: meets("U"),
  };
  return {
    beginTime: begin,
    endTime: end,
    building: "SERC",
    buildingDescription: "Science Education and Research Center",
    campus: "MN",
    campusDescription: "Main",
    room: "116",
    meetingType: "CLAS",
    meetingTypeDescription: "Class",
    startDate: "01/11/2027",
    endDate: "04/26/2027",
    ...flags,
    ...overrides,
  };
}

/** A Banner class-search section for tests, CIS 2168 001 on TR by default. */
export function classSection(
  overrides: Partial<ClassSection> & { meetings?: MeetingTime[] } = {},
): ClassSection {
  const { meetings, ...rest } = overrides;
  const subject = rest.subject ?? "CIS";
  const courseNumber = rest.courseNumber ?? "2168";
  return {
    id: 1,
    term: "202703",
    termDesc: "2027 Spring",
    courseReferenceNumber: "41207",
    partOfTerm: "1",
    courseNumber,
    subject,
    subjectDescription: "Computer & Information Science",
    sequenceNumber: "001",
    campusDescription: "Main",
    scheduleTypeDescription: "Lecture",
    courseTitle: "Data Structures",
    creditHours: 4,
    creditHourLow: 4,
    creditHourHigh: null,
    maximumEnrollment: 30,
    enrollment: 18,
    seatsAvailable: 12,
    waitCapacity: 10,
    waitCount: 0,
    waitAvailable: 10,
    openSection: true,
    subjectCourse: `${subject}${courseNumber}`,
    instructionalMethod: "CLAS",
    instructionalMethodDescription: "Classroom In-Person",
    isSectionLinked: false,
    linkIdentifier: null,
    faculty: [
      {
        bannerId: "1",
        displayName: "Whitlock, Dana",
        emailAddress: null,
        primaryIndicator: true,
      },
    ],
    sectionAttributes: [],
    ...rest,
    meetingsFaculty: (meetings ?? [meetingTime("TR", "0930", "1050")]).map(
      (meetingTime) => ({ meetingTime }),
    ),
  };
}
