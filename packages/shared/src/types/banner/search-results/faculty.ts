export interface Faculty {
  /**
   * For guests, a number Banner hands out per session, not the person's
   * Banner ID: none of 246 `getFacultyMeetingTimes` ids from later sessions
   * matched the saved search pages.
   */
  bannerId: string;
  /** Always null here, even when the section has several meetings. */
  category: null;
  class: "net.hedtech.banner.student.faculty.FacultyResultDecorator";
  courseReferenceNumber: string;
  /** Sometimes ends with a space ("Denise A. Salerno "). */
  displayName: string;
  emailAddress: string | null;
  /** True for at most one entry per section; none when no one is primary. */
  primaryIndicator: boolean;
  term: string;
}
