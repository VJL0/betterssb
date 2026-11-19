/**
 * The "Enrollment/Waitlist" tab, `POST /ssb/searchResults/getEnrollmentInfo`.
 */

/**
 * Data carried by the Enrollment/Waitlist fragment (754 to 763 bytes): one
 * `<section aria-labelledby="enrollmentInfo">` with six `<span
 * class="status-bold">` labels, each followed by its number in a `<span
 * dir="ltr">`, and an `<hr/>` between the enrollment and waitlist groups.
 * All six were on every section. Each equals the `searchResults` row's
 * field noted below for all 150 listed sections, so the tab adds nothing
 * beyond a fresher read of the counts.
 */
export interface EnrollmentInfo {
  /** "Enrollment Actual:" label; the row's `enrollment`. */
  enrollmentActual: number;
  /** "Enrollment Maximum:" label; the row's `maximumEnrollment`. */
  enrollmentMaximum: number;
  /**
   * "Enrollment Seats Available:" label; maximum minus actual, so negative
   * when over-enrolled (4 of 156, printed "-1" or "-4"). The row's
   * `seatsAvailable`.
   */
  enrollmentSeatsAvailable: number;
  /** "Waitlist Capacity:" label; 0 or 100 on every section seen. */
  waitlistCapacity: number;
  /** "Waitlist Actual:" label; the row's `waitCount`. */
  waitlistActual: number;
  /**
   * "Waitlist Seats Available:" label; capacity minus actual, never
   * negative. The row's `waitAvailable`.
   */
  waitlistSeatsAvailable: number;
}
