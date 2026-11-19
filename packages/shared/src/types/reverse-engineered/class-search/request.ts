/**
 * Query strings of the `GET /ssb/classSearch/get_*` lookups behind the class
 * search's select2 pickers. Every lookup takes the same keys; they differ only
 * in which they read, so each response file names its query interface.
 *
 * Banner's page (`setupBindings` in `registrationView`) sends `searchTerm` as
 * typed, `term` from `#txt_term[listofsearchterms]` (the session's term),
 * `offset` as the select2 page (1, 2, …), `max` "10", `uniqueSessionId` and
 * jQuery's cache-buster `_` (epoch ms): the six keys the user's HARs show.
 * Its code also names `startDatepicker` and `endDatepicker`, but the class
 * search page has no such inputs, so they are left out. It asks for the next
 * page only for the pickers with class `page` (subject and instructor), and
 * only while a page comes back with 10 rows.
 *
 * None of the lookups needs a session: with a fresh cookie jar, before any
 * `term/search`, all eight answered as usual, and a 200 sets no cookie
 * (checked on `get_session`). `uniqueSessionId` is ignored (missing, or
 * another session's id, gives the same rows, 8 of 8), and a POST of the
 * same fields as a form answered the same (subject and session tried).
 * Instructor codes are the exception: they only work in the session that
 * looked them up (`InstructorOption`).
 */
export interface LookupQuery {
  /**
   * Case-insensitive SQL `LIKE` against the code or the description, matched
   * against the stored text, not the HTML-escaped one Banner sends ("Adult &
   * Organizational Develop" finds AOD, "&amp;" finds nothing, "St. Joseph's"
   * finds XSJ). Wrapped in `%` on both sides unless it already holds a `%`,
   * then used as is and anchored: "Acc%" and "%unting" find ACCT, "CCT%" and
   * "A%co" nothing. `_` is any one character, so "%" or "_" alone lists
   * everything. Not trimmed (" Acc" and "Acc " find nothing; " Art" finds 2
   * colleges) and not split ("ACCT,ADV" finds nothing). Missing is the same
   * as "". The instructor lookup matches names instead (`InstructorQuery`).
   */
  searchTerm?: string;
  /**
   * A term code ("202703"). Ignored by the lookups whose list is the same for
   * every term (campus, college, attribute, instructional method, session).
   */
  term?: string;
  /**
   * 1-based select2 page; the first row is `(offset - 1) * max`. Read only by
   * the subject and instructor lookups (`PagedLookupQuery`); the others
   * return their whole list for any `offset` and `max`, even "abc", "-1" or
   * none.
   */
  offset?: string;
  /** Page size; see `offset`. */
  max?: string;
  uniqueSessionId?: string;
  _?: string;
  /**
   * Left out by Banner's class search page (it has no date inputs); every
   * capture here sent both empty.
   */
  startDatepicker?: string;
  endDatepicker?: string;
}

/**
 * `get_subject` and `get_instructor`, the two lookups that page. No upper
 * limit on `max` was hit: "5000" lists all 183 subjects of 2027 Spring and
 * "20000" all 3,412 instructors. They treat bad values differently:
 *
 * - `offset` or `max` missing: a 500 from both ("Cannot invoke method
 *   toInteger() on null object"; the message of instructor without `max`
 *   wasn't recorded).
 * - "abc" in either: a 500 from both ("For input string: &quot;abc&quot;";
 *   "1.5" too for the subject `offset`).
 * - `offset` "0": a 500 "first-result value cannot be negative : -10" from
 *   subject, `[]` from instructor.
 * - `max` "0": the whole subject list whatever `offset` says, but `[]` from
 *   instructor.
 * - `max` "-1": a 500 "max-results cannot be negative" from subject, `[]`
 *   from instructor.
 * - A page past the end: `[]` from both.
 *
 * Without a usable `term` (missing, "" or "999999", and "abc" for subject)
 * both answer `[]`.
 */
export interface PagedLookupQuery extends LookupQuery {
  term: string;
  offset: string;
  max: string;
}

/**
 * `get_partOfTerm`. `term` is required: without the key it is a 500 "Cannot
 * invoke method split() on null object"; "", "999999" or two codes
 * ("202620,202703") give `[]`.
 */
export interface PartOfTermQuery extends LookupQuery {
  term: string;
}
