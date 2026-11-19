import type { BannerErrorPage } from "../common";

/**
 * What these routes return instead of JSON when a parameter is wrong:
 * Banner's full error page (`text/html;charset=UTF-8`, titled "Banner"), 5.4
 * to 5.5 KB with "Sorry, the server received an internal error." for a 500
 * and 5 KB for a 404. The response is a `string`; this is the data its `<head>` carries.
 *
 * Each of the 27 500s seen (neither 404) also set a new JSESSIONID (and
 * `grails_remember_me`), so the session loses its picked term: a search right
 * after returns `data: null` with `pathMode: null`, and the class search page
 * redirects.
 */
export interface TermErrorPage extends BannerErrorPage {
  /**
   * `<meta name="errorMessage">`, HTML-escaped, the Groovy or Java exception
   * message, also printed in the body after "Error Message:". Seen here:
   *
   * - `getTerms` without `offset` or `max`: "Cannot invoke method toInteger()
   *   on null object"; `offset` "0": "first-result value cannot be negative :
   *   -10" (the computed first row, "-20" for "-1"); `max` "-1": "max-results
   *   cannot be negative"; a non-integer: "For input string: &quot;abc&quot;".
   * - `term/search` with a date not in "MM/DD/YYYY": "Invalid start date".
   * - `saveTerm` with such a date: "Unparseable date: &quot;2027-01-15&quot;",
   *   or just the value ("1/5/2027").
   * - `termSelection` without `mode`: "".
   * - 404 (`registration/getTerms`, `term/getTerms`): "Sorry, This page is
   *   not available.".
   */
  errorMessage: string;
}
