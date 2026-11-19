/**
 * The "Course Description" tab, `POST /ssb/searchResults/getCourseDescription`.
 */

/**
 * Data carried by the Course Description fragment (262 to 2,975 bytes): one
 * `<section aria-labelledby="courseDescription">` that opens with the
 * comment `<!--display course description-->` and ends with `<!--when there
 * is no course or section description, provide the no information
 * message-->`. Between them, the catalog's description in a `<p>`, then
 * the section's own text under `<h3>Section Description</h3>` in another
 * `<p>`. With neither, the section holds only the text "No course
 * description is available." (9 of 156) and both keys are absent.
 *
 * Values are the decoded text. The markup escapes `"`, `'`, `&` and once
 * `@` (`&#34;`, `&#39;`, `&amp;`, `&#64;` in "tuccadv&#64;temple.edu") but
 * passes the catalog's own markup through: 11 of 156 descriptions hold a
 * second `<p>` mid-text, so the fragment ends in `</p></p>` and a DOM
 * parser splits the text into two paragraphs. A raw newline is kept inside
 * the text of 2.
 */
export interface CourseDescription {
  /**
   * The `<p>` before the `<h3>`, 31 to 2,347 characters; absent for 10 of
   * 156. 21 hold runs of two spaces.
   */
  courseDescription?: string;
  /**
   * The `<p>` under `<h3>Section Description</h3>`, which only that `<p>`
   * follows (17 of 156). Shown beside the catalog's description for 16 and
   * alone for 1, a certificate seminar with no catalog text.
   */
  sectionDescription?: string;
}
