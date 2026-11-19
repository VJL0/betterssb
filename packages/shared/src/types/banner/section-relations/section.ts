/**
 * The `section` of `getFacultyMeetingTimes?first=first`: Banner's
 * `SectionDecorator` for the requested section, the object the class search
 * row is built from, with the row's lists left null and about 40 more
 * fields. Seen on 157 of 157.
 */

import type { College, GradingMode } from "../section-details/codes";
import type { ScheduleType } from "../search-results/codes";
import type { BannerDate } from "../search-results/meeting";
import type { Section } from "../search-results/section";
import type {
  PrerequisiteCheckMethod,
  SectionCampus,
  SectionSession,
  SectionStatus,
} from "./codes";

/**
 * The class search row's fields, with the same values except for the live
 * counts (`enrollment`, `seatsAvailable`, `crossList*` moved between the two
 * captures) and escaping: here `instructionalMethodDescription` and
 * `crossList` are HTML-escaped ("Non-Classroom (Field &amp; I.S.)",
 * "A&gt;"; 34 and 2 of 157) where the saved class search pages have "&" and
 * ">".
 */
export interface FacultyMeetingTimesSection extends Omit<
  Section,
  | "bookstores"
  | "faculty"
  | "meetingsFaculty"
  | "sectionAttributes"
  | "feeAmount"
> {
  class: "net.hedtech.banner.student.schedule.SectionDecorator";
  bookstores: null;
  faculty: null;
  meetingsFaculty: null;
  sectionAttributes: null;
  /** Null on all 157, including the 20 whose class search row has a fee. */
  feeAmount: null;

  /** The code behind `campusDescription`, which the class search row lacks. */
  campus: SectionCampus;
  /** Four-digit department code ("1312"). */
  department: string;
  college: College;
  scheduleType: ScheduleType;
  /** "D" on 135 of 157, "E" on 21, "W" on 1. */
  sectionSession: SectionSession;
  sectionStatus: SectionStatus;
  /** `creditHours` again: equal on all 157, null on 133. */
  billHours: number | null;
  /** Set on 31 of 157, together with `gradingModeDescription`. */
  gradingMode: GradingMode | null;
  /** "Standard Letter Grade"; matches `GradingModeDescriptions`. */
  gradingModeDescription: string | null;
  prerequisiteCheckMethod: PrerequisiteCheckMethod;
  /** "Y" on 75 of 157, else null. */
  registrationAuthorizationActiveCode: "Y" | null;
  partOfTermStartDate: BannerDate;
  partOfTermEndDate: BannerDate;
  /** 6 to 31; not derivable from the two dates. */
  partOfTermWeeks: number;
  /**
   * One date per term: "06/16/2026" for Summer I 2026, "09/08/2026" for Fall
   * 2026, "01/26/2027" for Spring 2027.
   */
  censusEnrollmentDate: BannerDate;
  /** A string, not a boolean. */
  ceuIndicator: "false";

  overrideDurationIndicator: false;
  registrationWaitlistNotificationIndicator: false;
  /** False on all 157, though every one's Restrictions tab lists some. */
  restrictions: false;
  select: false;
  timeConflicts: false;
  wlPositionWebcDisplayIndicator: false;

  contactHours: null;
  courseAlias: null;
  durationUnit: null;
  durationUnitDescription: null;
  labHours: null;
  lectureHours: null;
  otherHours: null;
  learnerRegStartFromDate: null;
  learnerRegStartToDate: null;
  meetingTimes: null;
  numberOfUnits: null;
  registrationFromDate: null;
  registrationToDate: null;
  sectionTitle: null;
  selectedStartEndDate: null;
  status: null;
  totalCreditHours: null;
  waitListPosition: null;
  waitListPriority: null;
  waitListPriorityEndDate: null;
}
