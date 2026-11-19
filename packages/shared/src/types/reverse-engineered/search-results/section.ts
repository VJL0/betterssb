import type {
  CreditHourIndicator,
  InstructionalMethod,
  PartOfTerm,
  ScheduleTypeDescription,
  SectionCampusDescription,
} from "./codes";
import type { Faculty } from "./faculty";
import type { MeetingFaculty } from "./meeting";
import type { SectionAttribute } from "./section-attribute";

/**
 * One row of `searchResults`. Every key is always present; only the values
 * marked `| null` are ever missing. Text fields are HTML-escaped
 * ("Computer &amp; Information Science").
 */
export interface Section {
  id: number;
  /** Six-digit term code: year + "03" spring, "20" summer I, "26" summer II, "36" fall. */
  term: string;
  termDesc: string;
  /** Unique within a term; two to five digits. */
  courseReferenceNumber: string;
  partOfTerm: PartOfTerm;
  subject: string;
  subjectDescription: string;
  courseNumber: string;
  /** Always equal to `courseNumber`. */
  courseDisplay: string;
  /** Always `subject + courseNumber` ("ACCT2103"). */
  subjectCourse: string;
  /** Usually three characters ("001", "701"), sometimes one or two. */
  sequenceNumber: string;
  courseTitle: string;
  campusDescription: SectionCampusDescription;
  scheduleTypeDescription: ScheduleTypeDescription;

  /** Mostly null; read `creditHourLow` for the credits. */
  creditHours: number | null;
  /** Always set; can be fractional (1.5, 4.5). */
  creditHourLow: number;
  /** Null exactly when `creditHourIndicator` is. */
  creditHourHigh: number | null;
  creditHourIndicator: CreditHourIndicator | null;

  maximumEnrollment: number;
  enrollment: number;
  /** `maximumEnrollment - enrollment`, so negative when over-enrolled. */
  seatsAvailable: number;
  waitCapacity: number;
  waitCount: number;
  /** `waitCapacity - waitCount`; never negative. */
  waitAvailable: number;
  /**
   * Whether the section takes registrations at all: false only when both
   * seats and waitlist are gone. A full section with waitlist room is true.
   */
  openSection: boolean;

  /**
   * Cross-list group code. The four `crossList*` fields are all null or all
   * set; the group's seats can run out before the section's own.
   */
  crossList: string | null;
  crossListCapacity: number | null;
  crossListCount: number | null;
  /** `crossListCapacity - crossListCount`; can be negative. */
  crossListAvailable: number | null;

  /** Groups linked sections; seen on one section in three terms. */
  linkIdentifier: string | null;
  /** False on every section seen, including the one with a `linkIdentifier`. */
  isSectionLinked: boolean;
  /** Null on every section seen. */
  reservedSeatSummary: null;

  /** Null for under 1% of sections. */
  instructionalMethod: InstructionalMethod | null;
  instructionalMethodDescription: string | null;
  /** Formatted dollars ("$250.00", "$3,240.00"), not a number. */
  feeAmount: string | null;
  /** Always exactly one entry. */
  bookstores: [Bookstore];

  faculty: Faculty[];
  /** Empty for a few sections that have no scheduled meeting at all. */
  meetingsFaculty: MeetingFaculty[];
  sectionAttributes: SectionAttribute[];
}

export interface Bookstore {
  /** HTML-escaped like the rest: query separators arrive as "&amp;". */
  url: string;
  label: "View Course Materials";
}
