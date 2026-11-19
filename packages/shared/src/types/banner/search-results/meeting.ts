import type {
  MeetingCampus,
  MeetingCategory,
  MeetingType,
  ScheduleType,
} from "./codes";

/** 24-hour "HHMM", e.g. "0950" or "1730". */
export type BannerTime = string;
/** "MM/DD/YYYY". */
export type BannerDate = string;

export interface MeetingTime {
  /** Null together with `endTime` for online, arranged and TBA meetings. */
  beginTime: BannerTime | null;
  endTime: BannerTime | null;
  /**
   * `building`, `buildingDescription`, `campus`, `campusDescription` and
   * `room` are all null or all set; null for about 40% of meetings.
   */
  building: string | null;
  buildingDescription: string | null;
  campus: MeetingCampus | null;
  campusDescription: string | null;
  room: string | null;
  category: MeetingCategory;
  class: "net.hedtech.banner.general.overall.MeetingTimeDecorator";
  courseReferenceNumber: string;
  /** Always a decimal (3.0) when set. */
  creditHourSession: number | null;
  hoursWeek: number;
  meetingScheduleType: ScheduleType;
  meetingType: MeetingType;
  meetingTypeDescription: string;
  startDate: BannerDate;
  endDate: BannerDate;
  term: string;
  /** A meeting can have times but no days checked (10 of 10,259 in Spring 2027). */
  monday: boolean;
  tuesday: boolean;
  wednesday: boolean;
  thursday: boolean;
  friday: boolean;
  saturday: boolean;
  sunday: boolean;
}

export interface MeetingFaculty {
  category: MeetingCategory;
  class: "net.hedtech.banner.student.schedule.SectionSessionDecorator";
  courseReferenceNumber: string;
  /** Always empty; instructors are on the section's own `faculty`. */
  faculty: [];
  meetingTime: MeetingTime;
  term: string;
}
