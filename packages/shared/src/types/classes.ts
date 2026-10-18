/**
 * The API's public class search (`/api/classes/*`). Mirrors
 * apps/api/app/modules/classes/schemas.py: the subset of Banner's section JSON
 * the app uses, so a full `SSBSection` from the extension also fits.
 */
import type { SSBCodeDescription } from "./ssb";

export interface ClassFaculty {
  bannerId: string;
  displayName: string;
  emailAddress: string | null;
  primaryIndicator: boolean;
}

export interface ClassMeetingTime {
  /** "HHMM", or null for online and TBA. */
  beginTime: string | null;
  endTime: string | null;
  building: string | null;
  buildingDescription: string | null;
  campus: string | null;
  campusDescription: string | null;
  room: string | null;
  meetingType: string | null;
  meetingTypeDescription: string | null;
  startDate: string | null;
  endDate: string | null;
  monday: boolean;
  tuesday: boolean;
  wednesday: boolean;
  thursday: boolean;
  friday: boolean;
  saturday: boolean;
  sunday: boolean;
}

export interface ClassSection {
  id: number;
  term: string;
  termDesc: string;
  courseReferenceNumber: string;
  partOfTerm: string;
  courseNumber: string;
  subject: string;
  subjectDescription: string;
  sequenceNumber: string;
  campusDescription: string;
  scheduleTypeDescription: string;
  courseTitle: string;
  creditHours: number | null;
  creditHourLow: number | null;
  creditHourHigh: number | null;
  maximumEnrollment: number;
  enrollment: number;
  seatsAvailable: number;
  waitCapacity: number;
  waitCount: number;
  waitAvailable: number;
  openSection: boolean;
  subjectCourse: string;
  instructionalMethod: string | null;
  instructionalMethodDescription: string | null;
  isSectionLinked: boolean;
  linkIdentifier: string | null;
  faculty: ClassFaculty[];
  meetingsFaculty: { meetingTime: ClassMeetingTime }[];
  sectionAttributes: SSBCodeDescription[];
}

export interface ClassSearchResult {
  totalCount: number;
  sections: ClassSection[];
  /** ISO time Banner returned this data. Seats change. */
  fetchedAt: string;
}

export interface ClassSearchFilters {
  term: string;
  subject?: string;
  courseNumber?: string;
  keyword?: string;
  attribute?: string;
  offset?: number;
  limit?: number;
}
