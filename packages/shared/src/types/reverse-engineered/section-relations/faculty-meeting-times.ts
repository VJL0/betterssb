/**
 * `GET /ssb/searchResults/getFacultyMeetingTimes`, the "Instructor/Meeting
 * Times" tab: JSON, which Banner's page renders itself. The same meetings as
 * the class search row's `meetingsFaculty`, but with each meeting's
 * instructors filled in instead of an empty `faculty`. Saved responses are in
 * reverse-engineering/section-relations/getFacultyMeetingTimes/ (plain) and
 * getFacultyMeetingTimes-first/ (`first=first`), 157 sections of each.
 *
 * Compared with the class search pages of the same sections, the meetings
 * were identical in 156 of 157 (in another order in 30); the exception is
 * below on `FacultyMeeting.meetingTime`.
 */

import type { Faculty } from "../search-results/faculty";
import type { MeetingFaculty, MeetingTime } from "../search-results/meeting";
import type { FacultyMeetingTimesSection } from "./section";

export interface FacultyMeetingTimesResponse {
  /**
   * One entry per meeting, sorted by `meetingTime.startDate` (157 of 157);
   * the class search sorts its `meetingsFaculty` differently in 30 of them.
   * Empty for the 10 sections the class search shows no meeting or
   * instructor for. Seen with 0 to 9 entries; 221 in all.
   */
  fmt: FacultyMeeting[];
}

/**
 * `first=first`: the same `fmt` (157 of 157), plus the section the dialog
 * is about.
 */
export interface FacultyMeetingTimesWithSection extends FacultyMeetingTimesResponse {
  section: FacultyMeetingTimesSection;
}

/**
 * The class search's `MeetingFaculty` with its instructors. Every entry's
 * `courseReferenceNumber` and `term` are the requested section's.
 */
export interface FacultyMeeting extends Omit<
  MeetingFaculty,
  "faculty" | "meetingTime"
> {
  /**
   * The meeting's own `category` on all 220 with a `meetingTime`, and "1" on
   * the one without.
   */
  category: MeetingFaculty["category"];
  /**
   * Who teaches this meeting. A person who teaches several meetings is
   * listed under each (in 23 of 147 sections), and can be primary on one
   * and not on another (6 sections). Empty on 25 of 221 entries; at most 5
   * seen.
   */
  faculty: MeetingInstructor[];
  /**
   * Null on 1 of 221 (Spring 2027 CRN 48886): an extra entry with two
   * instructors and category "1" that the class search row doesn't have.
   */
  meetingTime: MeetingTime | null;
}

/**
 * The class search's `Faculty`, per meeting. Of the 246 seen, 7 names end
 * with a space and 2 have a null `emailAddress`, like the class search.
 */
export interface MeetingInstructor extends Omit<
  Faculty,
  "category" | "bannerId" | "primaryIndicator"
> {
  /**
   * A session-scoped handle, not the person's Banner ID: four or five digits
   * ("12032"), handed out per session, so none of the 246 matched the class
   * search pages saved earlier for the same instructors. Within one session
   * it stays the same across calls (plain and `first=first` agreed on all
   * 157), and it is what `contactCard/retrieveData` takes as `bannerId`.
   */
  bannerId: string;
  /** Its meeting's `category` (246 of 246), where the class search has null. */
  category: MeetingFaculty["category"];
  /**
   * At most one per meeting; none on 44 of 221. Can differ from the class
   * search row's flag for the same person (6 sections), which has one flag
   * per section rather than per meeting.
   */
  primaryIndicator: boolean;
}
