/**
 * `GET /ssb/classSearch/getTerms` and `GET /ssb/courseSearch/getTerms`, the
 * select2 term pickers of the class search and the course catalog. Neither
 * needs a session: they answer without cookies, before or after any
 * `term/search`, and the list doesn't change with the session's picks. POST
 * with the same fields as a form answers the same. The body is pretty-printed
 * JSON that starts with a newline (`"\n[\n  {\n    \"code\": …`).
 *
 * The other controllers' `getTerms` (`classRegistration`, `plan`,
 * `prepareRegistration`, `registrationHistory`, and `/ssb//getTerms`, which
 * the guest registration and plan pages point at) redirect a guest with 302 to
 * the CAS sign-in at fim.temple.edu; `registration/getTerms` and
 * `term/getTerms` are 404 pages. Signed in, `classRegistration/getTerms` and
 * `plan/getTerms` answer this same shape (the user's HARs).
 */

import type { CodeDescription } from "../common";

/**
 * Banner's page sends `searchTerm` as typed, `offset` as the select2 page
 * (1, 2, …) and `max` "10", and asks for the next page only while a page
 * comes back full. To show a preselected term it sends the picker's
 * `data-init-text` as `searchTerm` with `offset` "1" and `max` "1", and uses
 * the answer only when it has exactly one row. Signed in, jQuery adds a
 * cache-buster `_` (epoch ms), which Banner ignores, as it does unknown keys.
 *
 * Every bad value is a 500 error page (`TermErrorPage`) instead of JSON.
 */
export interface GetTermsQuery {
  /**
   * Case-insensitive SQL `LIKE` against the code or the plain description
   * (without " (View Only)", so "View" finds nothing). Banner wraps it in `%`
   * on both sides unless it already holds a `%`, in which case the pattern is
   * used as is and anchored: "%Fall" ends with Fall (2024 Fall (View Only)
   * too), "2026%" starts with 2026, "%2026" finds only 202026 (2020 Summer
   * II), "Fa%l" and "Fall%" find nothing. `_` matches any one character
   * ("202_36" is the Falls of the 2020s). Quotes and backslashes find nothing
   * rather than failing. Not trimmed ("Fall " finds only the Fall Orientation
   * terms, "202636 " nothing), but spaces alone list every term. A two-term
   * pick ("202636,202703") finds nothing. Missing is the same as "".
   */
  searchTerm?: string;
  /**
   * 1-based page number; the first row is `(offset - 1) * max`. Required: a
   * missing `offset` or `max` is a 500 "Cannot invoke method toInteger() on
   * null object". "0" or below is a 500 "first-result value cannot be
   * negative : -10" (that first row, -20 for "-1"); "1.5" or "abc" a 500 "For
   * input string: &quot;abc&quot;". A page past the end is `[]`.
   */
  offset: string;
  /**
   * Page size. "0" means no limit: the whole (filtered) list, whatever
   * `offset` says. No upper limit was hit ("100000" works). Negative is a 500
   * "max-results cannot be negative".
   */
  max: string;
  _?: string;
}

/**
 * Newest first, sorted by `code` descending. Seen on 2026-11-18: 64 terms from
 * `classSearch`, every Spring, Summer I, Summer II and Fall from 2011 Summer I
 * (201120) to 2027 Spring (202703) with no gaps, and 93 from `courseSearch`,
 * the same plus 2028 Fall (202836, with no 2027 Summer or Fall before it) and
 * 28 orientation terms the class search doesn't list: Spring Orientation
 * 2012–2025 and Fall Orientation 2011–2024.
 */
export type GetTermsResponse = TermOption[];

export interface TermOption extends CodeDescription {
  /** Six digits: year + `TermSeason` suffix ("202636"). */
  code: string;
  /**
   * Year + season ("2026 Fall", "2025 Spring Orientation Term"). In the
   * `classSearch` list the 58 terms from 2025 Summer II back end in
   * " (View Only)"; the other 6 are exactly what signed-in
   * `classRegistration/getTerms` listed in the user's HARs. The same terms in
   * `courseSearch` don't have the suffix. A view-only term still opens and
   * searches as a guest. Banner's picker inserts it as HTML.
   */
  description: string;
}
