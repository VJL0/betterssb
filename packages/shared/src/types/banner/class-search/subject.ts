/**
 * `GET /ssb/classSearch/get_subject` (`PagedLookupQuery`), the Subject
 * picker; its codes go in `txt_subject` of `searchResults`, comma-separated
 * ("ACCT,ADV").
 *
 * Like every lookup it answers `application/json;charset=UTF-8` with
 * `Cache-Control: no-cache,no-store`, pretty-printed and starting with a
 * newline (`"\n[\n  {\n    \"code\": …`); an empty list is `"\n[\n]"`. A bad
 * parameter is a 500 page instead (`LookupErrorPage`).
 */

import type { CodeDescription } from "../common";

/**
 * The subjects of `term`: 134 in 2026 Summer I, 183 in Fall and 183 in
 * Spring (186 across the three; Fall has COED and ENGG, Spring GRAD and JST).
 * Every subject of the term's sections is listed, plus a few no captured
 * section had (5, 0 and 4: CSI, HRPR…). Sorted by description in code-point
 * order of the unescaped text ("Media Studies &amp; Production" before
 * "Media and Communication"). With two terms ("202620,202703") it lists only
 * the first one's subjects.
 */
export type GetSubjectResponse = SubjectOption[];

export interface SubjectOption extends CodeDescription {
  /** Two to four upper-case letters ("AS", "ACCT"); the section's `subject`. */
  code: string;
  /**
   * HTML-escaped ("Adult &amp; Organizational Develop", "Women&#39;s"),
   * exactly the sections' `subjectDescription`.
   */
  description: string;
}
