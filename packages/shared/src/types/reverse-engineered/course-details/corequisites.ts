/**
 * The Corequisites tab, `POST /ssb/courseSearchResults/getCorequisites`.
 */

import type { CourseIdentity } from "./course-identity";

/**
 * Data carried by the Corequisites fragment: an `<h3>Corequisites</h3>`,
 * then a `<table class="basePreqTable">` with the columns Subject, Course
 * Number and Title, or the text "No corequisite course information
 * available." (also for an unknown course or a bad form; always 200). The
 * section dialog's `searchResults/getCorequisites` prints the same table.
 */
export interface CourseCorequisites {
  /**
   * Table rows in Banner's order, one each for the 4 of 178 courses with
   * any. Empty for the no-information text.
   */
  corequisites: CourseCorequisite[];
  courseIdentity?: CourseIdentity;
}

/** One row of the corequisites table. */
export interface CourseCorequisite {
  /** "Subject" column: the subject's description, not its code ("Early Childhood Education"). */
  subject: string;
  /** "Course Number" column ("2105"). */
  courseNumber: string;
  /** "Title" column, the abbreviated title ("Cognit &amp; Lrng in Classrm"). */
  title: string;
}
