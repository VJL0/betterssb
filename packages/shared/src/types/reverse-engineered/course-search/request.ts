/**
 * Requests of the Browse Course Catalog (`/ssb/courseSearch/courseSearch`):
 * the course search, the "View Sections" button and the reset behind
 * "Search Again". Every value is a string; lists are comma-separated codes
 * ("ACCT,ACMS"). Probed on 2026-11-18 in guest sessions, mostly on 2026 Fall
 * with subject ACCT (64 courses).
 *
 * The session needs a term first: `GET
 * /ssb/term/termSelection?mode=courseSearch`, then `POST
 * /ssb/term/search?mode=courseSearch` with `term` and a
 * `uniqueSessionId`, with the cookies those set (a `mode=search` session
 * works too). Without it, and after any 500, `courseSearchResults` is a 500
 * page until `term/search` runs again; `resetDataForm` doesn't bring it back.
 */

import type { ResetDataFormRequest } from "../app/reset-data-form";

/**
 * Query string of `GET /ssb/courseSearchResults/courseSearchResults`.
 *
 * Banner's page (`searchGo` in `registrationView`) sends the filled-in
 * inputs of the form, then `txt_term`, `startDatepicker`, `endDatepicker`,
 * `uniqueSessionId`, `pageOffset`, `pageMaxSize` ("10"), `sortColumn`
 * ("subjectDescription") and `sortDirection` ("asc"), in that order. It
 * strips `*^'!@$#&?[]()|` from free text and percent-encodes every value
 * twice ("financial%2520statements"), because the server decodes once more:
 * sent once, "c++" searched for "c" (306 courses) and a `%` fails
 * (`CourseSearchResultsErrorPage`).
 *
 * Text matching ignores case; codes don't ("acct" finds nothing). An
 * unknown code finds nothing, with `success: true`.
 */
export interface CourseSearchResultsQuery {
  /**
   * Picks the catalog, even one other than the session's term (a Fall
   * session got Spring's 12,917 courses). Left out, the search finds
   * nothing.
   */
  txt_term: string;
  /** Ignored: missing or another session's id gave the same courses. */
  uniqueSessionId?: string;
  /** Sent empty; the catalog page has no date inputs. */
  startDatepicker?: string;
  endDatepicker?: string;
  /** Any row offset ("7" works); past the end gives `data: []`. */
  pageOffset?: string;
  /** Capped at "500"; see `CourseSearchResultsResponse.pageMaxSize`. */
  pageMaxSize?: string;
  /**
   * "subjectDescription" (Banner's default, then by course number), or a
   * sortable column: "courseTitle", "subject", "courseNumber". Anything
   * else gives `success: false` and no rows. Works on a cached set too.
   */
  sortColumn?: string;
  /** Anything else gives `success: false` and no rows. */
  sortDirection?: "asc" | "desc";
  /** Subject codes from `get_subject`. */
  txt_subject?: string;
  /**
   * Lowest course number, four digits ("2000"). Only works with
   * `txt_course_number_range_To`: alone it finds nothing.
   */
  txt_course_number_range_From?: string;
  /**
   * Highest course number ("2999"), inclusive. Alone it is an upper bound;
   * letters ("abc") find nothing. The class search's
   * `txt_course_number_range` and `txt_course_number_range_to` are ignored
   * here.
   */
  txt_course_number_range_To?: string;
  /**
   * "Keyword": every word, as whole words, in the title or description
   * ("financial statements" found 30, "financ" nothing).
   */
  txt_keywordall?: string;
  /** College codes from `get_college` ("BU,HP"). */
  txt_college?: string;
  /** Division codes (`CatalogDivisionCode`), "UG,GR". */
  txt_division?: string;
  /**
   * "Credit Hour Range": courses whose credits overlap `txt_credithourlow`
   * to `txt_credithourhigh` (3 to 3 found 1-to-3 and 3-to-4 courses). Each
   * is ignored without the other, so Banner's page fills a missing low with
   * "0" and a missing high with "9999999.999". Not a number ("x") is a 500.
   */
  txt_credithourlow?: string;
  txt_credithourhigh?: string;
  /** Attribute codes from `get_attribute` ("GW,GA"). */
  txt_attribute?: string;
  /**
   * "Course Title": the whole title ("financial accounting" found 3), or a
   * pattern with `%` ("Financial%", "%Introduction%"). A `%` followed by two
   * hex digits ("%Data%", "%29%", "Intro%Accounting") is blocked by Temple's
   * firewall once encoded twice (`RequestRejectedPage`), although the page's
   * own tooltip suggests "%29%".
   */
  txt_courseTitle?: string;
  /**
   * Not on the page, but honored: one exact course number ("2101" found 30
   * courses; "21" and "2101,2102" nothing).
   */
  txt_courseNumber?: string;
  /**
   * Not on the page, but honored: subject + course number, comma-separated
   * ("ACCT2101,ACCT2102").
   */
  txt_subjectcoursecombo?: string;
  /**
   * Not on the page, but honored: any of the words ("financial statements"
   * found 285).
   */
  txt_keywordany?: string;
  /** Not on the page, but honored: a substring ("financ" found 420). */
  txt_keywordlike?: string;
}

/**
 * Query string of the "View Sections" button: `GET
 * /ssb/searchResults/searchResults` (`#section-search-go-endpoint`), the
 * class search route, which Banner's page calls through
 * `sectionResultsCollection.fetch()` with only these six keys (no
 * `uniqueSessionId`; adding it changed nothing). It finds the same sections
 * as the class search (ENG0802: 101 in Fall, 107 in Spring).
 *
 * Sections are cached like courses, in a separate cache: until
 * `resetDataForm` with `resetSections`, the next "View Sections" returns the
 * first course's sections again. It works without a course search first.
 */
export interface ViewSectionsQuery {
  /**
   * The button's `data-subject` + `data-course` (`subjectCode` +
   * `courseDisplay`, "ACCT2103"). Exact and case-sensitive ("ACCT21" and
   * "acct2103" found nothing); a comma-separated list works (2 courses gave
   * 16 sections).
   */
  txt_subjectcoursecombo: string;
  /**
   * `#txt_term[listofsearchterms]`, the session's term. Another term, or
   * none, gives `data: null` (`ViewSectionsOtherTerm`).
   */
  txt_term: string;
  pageOffset: string;
  /** "10" from Banner's page; "500" worked. */
  pageMaxSize: string;
  /** "subjectDescription". */
  sortColumn: string;
  sortDirection: "asc" | "desc";
}

/**
 * Form of `POST /ssb/courseSearch/resetDataForm` as the catalog page sends
 * it; it answers "true" (`ResetDataFormResponse`). "Search Again" on the
 * course results sends both "true"; "Return to catalog" on the section
 * results sends `resetCourses` "false", which still empties the course cache
 * (any non-empty value does), and the page then runs the same course search
 * again.
 */
export interface CatalogResetForm extends ResetDataFormRequest {
  resetCourses: "true" | "false";
  resetSections: "true";
}
