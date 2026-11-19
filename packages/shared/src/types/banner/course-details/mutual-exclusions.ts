/**
 * The Mutual Exclusion tab,
 * `POST /ssb/courseSearchResults/getCourseMutuallyExclusions`.
 */

import type { CourseIdentity } from "./course-identity";

/**
 * Data carried by the Mutual Exclusion fragment: the sentence "This course
 * carries a mutual exclusion with the following courses; you may not enroll
 * in it if you have completed any of the following:", then a `<table
 * class="basePreqTable">` with the columns Subject, Course Number, Course
 * Title, Level and Grade; or the text "No Mutual Exclusion information
 * available." (also for an unknown course or a bad form; always 200). The
 * section dialog's `searchResults/getCourseMutuallyExclusions` prints the
 * same.
 */
export interface CourseMutualExclusions {
  /**
   * Table rows in Banner's order, 1 to 7 for the 9 of 178 courses with any.
   * Empty for the no-information text.
   */
  mutualExclusions: CourseMutualExclusion[];
  courseIdentity?: CourseIdentity;
}

/** One row of the mutual exclusion table. */
export interface CourseMutualExclusion {
  /** "Subject" column: the subject's description ("Finance"). */
  subject: string;
  /** "Course Number" column. */
  courseNumber: string;
  /** "Course Title" column, the abbreviated title. */
  courseTitle: string;
  /** "Level" column: a level's description ("Graduate"), not its code. */
  level: string;
  /**
   * "Grade" column: presumably the grade in that course that blocks
   * enrolling ("B-", "D").
   */
  grade: string;
}
