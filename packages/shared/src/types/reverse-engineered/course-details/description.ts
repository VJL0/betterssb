/**
 * The Course Description tab,
 * `POST /ssb/courseSearchResults/getCourseDescription`.
 */

import type { CourseIdentity } from "./course-identity";

/**
 * Data carried by the Course Description fragment, a `<section
 * aria-labelledby="courseDescription">` holding one `<p>`, or the text "No
 * course description is available." for a course without one, an unknown
 * course or a bad form (always 200, never 500).
 *
 * The section dialog's version (`searchResults/getCourseDescription`) adds
 * the section's own text under an `<h3>Section Description</h3>` when it has
 * one, plus two HTML comments.
 */
export interface CourseDescription {
  /**
   * Inner HTML of the `<p>`, with `&amp;`, `&#39;`, `&#34;` and once `&#43;`
   * escaped but any markup in the catalog text passed through: 13 of the 169
   * descriptions had a second `<p>` nested inside, so the fragment ends in
   * `</p></p>`. 33 to 1,957 characters; runs of two spaces are kept (13).
   * Null for "No course description is available." (9 of 178).
   */
  description: string | null;
  courseIdentity?: CourseIdentity;
}
