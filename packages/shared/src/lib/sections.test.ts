import { describe, expect, it } from "vitest";
import type { SSBMeetingTime, SSBSection } from "../types/ssb";
import {
  formatBannerTime,
  isSupportScheduleType,
  meetingTimeToDays,
  primaryInstructorName,
  ssbSectionToInternal,
} from "./sections";

const NO_DAYS = {
  monday: false,
  tuesday: false,
  wednesday: false,
  thursday: false,
  friday: false,
  saturday: false,
  sunday: false,
};

function meeting(overrides: Partial<SSBMeetingTime>): SSBMeetingTime {
  return {
    beginTime: "0900",
    endTime: "1050",
    building: "SERC",
    buildingDescription: "Science Education and Research Center",
    campus: "MN",
    campusDescription: "Main",
    room: "116",
    creditHourSession: 4,
    hoursWeek: 2,
    meetingType: "CLAS",
    meetingTypeDescription: "Class",
    startDate: "01/11/2027",
    endDate: "05/03/2027",
    ...NO_DAYS,
    ...overrides,
  };
}

function section(
  meetings: SSBMeetingTime[],
  overrides: Partial<SSBSection> = {},
): SSBSection {
  return {
    courseReferenceNumber: "7273",
    subjectCourse: "CIS2168",
    termDesc: "2027 Spring",
    scheduleTypeDescription: "Lecture",
    seatsAvailable: 12,
    maximumEnrollment: 30,
    faculty: [
      {
        bannerId: "1",
        courseReferenceNumber: "7273",
        displayName: "Pascucci, Christopher",
        emailAddress: "",
        primaryIndicator: true,
        term: "202703",
      },
    ],
    meetingsFaculty: meetings.map((meetingTime) => ({
      category: "01",
      courseReferenceNumber: "7273",
      meetingTime,
      term: "202703",
    })),
    ...overrides,
  } as SSBSection;
}

describe("meetingTimeToDays", () => {
  it("lists days in week order with Banner letters", () => {
    expect(
      meetingTimeToDays(
        meeting({ monday: true, thursday: true, sunday: true, tuesday: true }),
      ),
    ).toBe("MTRU");
  });

  it("is empty when no day is set", () => {
    expect(meetingTimeToDays(meeting({}))).toBe("");
  });
});

describe("formatBannerTime", () => {
  it("adds a colon to HHMM", () => {
    expect(formatBannerTime("0930")).toBe("09:30");
  });

  it("leaves other formats alone", () => {
    expect(formatBannerTime("09:30")).toBe("09:30");
  });
});

describe("primaryInstructorName", () => {
  it("falls back to TBA when no faculty is listed", () => {
    expect(primaryInstructorName(section([], { faculty: [] }))).toBe("TBA");
  });
});

describe("ssbSectionToInternal", () => {
  it("returns one entry per meeting block, all with the same CRN", () => {
    const entries = ssbSectionToInternal(
      section([
        meeting({ monday: true }),
        meeting({ wednesday: true, beginTime: "1100", endTime: "1220" }),
      ]),
    );
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => [e.crn, e.days, e.startTime, e.endTime])).toEqual(
      [
        ["7273", "M", "09:00", "10:50"],
        ["7273", "W", "11:00", "12:20"],
      ],
    );
  });

  it("carries the schedule type so labs are scheduled apart from lectures", () => {
    const [entry] = ssbSectionToInternal(
      section([meeting({ friday: true })], {
        scheduleTypeDescription: "Laboratory",
      }),
    );
    expect(entry?.scheduleType).toBe("Laboratory");
  });

  it("drops blocks with no days or no times", () => {
    const entries = ssbSectionToInternal(
      section([
        meeting({ beginTime: null, endTime: null, monday: true }),
        meeting({}),
        meeting({ tuesday: true }),
      ]),
    );
    expect(entries.map((e) => e.days)).toEqual(["T"]);
  });

  it("joins building and room into one location", () => {
    const [entry] = ssbSectionToInternal(section([meeting({ monday: true })]));
    expect(entry?.location).toBe("Science Education and Research Center 116");
  });
});

describe("isSupportScheduleType", () => {
  it.each([
    ["Laboratory", true],
    ["Lab", true],
    ["Recitation", true],
    ["Lecture", false],
    ["Lecture and Lab", false],
  ])("%j → %j", (type, support) => {
    expect(isSupportScheduleType(type)).toBe(support);
  });
});
