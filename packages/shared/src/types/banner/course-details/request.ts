/**
 * Parameters of the eight tabs of the Browse Course Catalog's course details
 * dialog, all under `/ssb/courseSearchResults/`: `getCourseCatalogDetails`
 * (Catalog), `getCourseDescription` (Course Description),
 * `getCourseAttributes` (Attributes), `getRestrictions` (Restrictions),
 * `getCorequisites` (Corequisites), `getPrerequisites` (Prerequisites),
 * `getCourseMutuallyExclusions` (Mutual Exclusion) and `getFees` (Fees), in
 * the dialog's tab order. Their paths are the `data-endpoint` of the
 * `#courseDetailsHeaders > h3` tabs on the course search page. A ninth,
 * `getSyllabus`, answers the same form though Temple's page has no tab for
 * it and no bundle names it.
 *
 * Each answers with an HTML fragment (`text/html;charset=UTF-8`), never JSON,
 * so the response is a `string`; the interfaces next to this file are the
 * data each fragment carries. Text in them is HTML-escaped ("&amp;", "&#39;",
 * "&#34;").
 *
 * None of them needs a session: they answered the same with no cookies at
 * all, without `X-Requested-With` or a synchronizer token, and without
 * `term/search`. A session that picked another term changes nothing (a Fall
 * session asking for a Spring course gets the Spring course). They still set
 * `JSESSIONID` and load-balancer cookies. A GET with the same query string, or
 * a POST with the fields in the query string and an empty body, returns the
 * same bytes as the form POST; a JSON body is ignored, as if no fields were
 * sent.
 *
 * Catalog, Prerequisites and Fees answer 500 with `CourseCatalogErrorPage`
 * when the fields don't name a course in effect for the term, which is why
 * a crawl that calls them bare sees only errors; the other five answer 200
 * with their empty state ("No course description is available."). That
 * happens for a missing or empty field, a course that doesn't exist
 * ("0000"), a lowercase subject or letter ("cis", "m494"), padding
 * (" 2168 "), wildcards ("216%", "%"), `subject` sent instead of
 * `subjectCode`, a repeated field, and a term before the course's first
 * catalog version ("000000", "1"). Syllabus answered 200 with its one
 * fixed text for every form tried, bad ones included (an unknown course, a
 * lowercase subject, no `courseNumber`, an empty body, "abc", "000000").
 *
 * Median response time was 1.0 s (95th percentile 1.3 s) over the 1,424
 * requests of the sample, sent one at a time.
 */

/**
 * Form body of every tab. Banner's page sends it with jQuery
 * `.load(url, data)`, a urlencoded POST, with the three values from the
 * clicked title's `data-attributes` ("202703,CIS,2168"). It sends no
 * `uniqueSessionId`.
 */
export interface CourseDetailsForm {
  /**
   * Required. Picks the catalog version in effect for that term, not a term
   * the course is offered in: catalog records are effective-dated, so CIS 2168
   * for 201036 has its 2010 description ("A continuation of CIS 1068
   * (0067)."), and any later term returns the newest version. It isn't
   * checked against the term list: "203003", "999999" and even "abc" return
   * the newest Catalog and Description. Prerequisites seem to end, though:
   * CIS 2168's showed for every term from 202036 to 202836 but not for
   * 203003, "999999" or "abc". Banner's page sends the term the search ran
   * in, from the `listofsearchterms` attribute of `#txt_term`.
   */
  term: string;
  /** Required, exact and case-sensitive ("CIS"). */
  subjectCode: string;
  /**
   * Required, exact and case-sensitive, as `courseNumber` in the search
   * results ("2168", "M494", "D982").
   */
  courseNumber: string;
  /**
   * Banner's page adds "first" only for the tab that opens the dialog
   * (Catalog), not when a tab is clicked. Any non-empty value ("first", "1",
   * "true", "last") appends `CourseIdentity`'s hidden spans to the other seven
   * tabs; empty or absent leaves them off. Catalog always has them, with or
   * without it.
   */
  first?: string;
}
