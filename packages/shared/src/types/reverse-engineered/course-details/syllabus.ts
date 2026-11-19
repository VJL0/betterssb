/**
 * The Syllabus tab, `POST /ssb/courseSearchResults/getSyllabus`, which
 * Temple's page doesn't show: no `#courseDetailsHeaders > h3` points at it
 * and no bundle names it. It takes the same `CourseDetailsForm` as the
 * other tabs.
 */

import type { CourseIdentity } from "./course-identity";

/**
 * Data carried by the Syllabus fragment, a `<section
 * aria-labelledby="syllabus">` (111 bytes) holding only the text "No
 * Syllabus Information Available". All 178 sampled courses got the same
 * bytes, and so did every malformed form tried (always 200, never 500), so
 * what a course with a syllabus would print is unknown. Captured
 * 2026-11-18.
 */
export interface CourseSyllabus {
  /** The section's trimmed text. */
  message: "No Syllabus Information Available";
  /** Added when the form has `first` (360 bytes then). */
  courseIdentity?: CourseIdentity;
}
