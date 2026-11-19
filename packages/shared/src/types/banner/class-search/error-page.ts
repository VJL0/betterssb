import type { BannerErrorPage } from "../common";

/**
 * What a lookup returns instead of JSON for a parameter it can't use: Banner's
 * 500 page (`text/html;charset=UTF-8`, 5,479 to 5,487 bytes). The response is
 * a `string`; this is the data its `<meta>` tags carry. Only `get_subject`,
 * `get_instructor` and `get_partOfTerm` read their parameters closely enough
 * to fail (`PagedLookupQuery`, `PartOfTermQuery`).
 *
 * Like other 500s it ends the session: after `get_subject` with `offset` "0"
 * the cookie jar held a new `JSESSIONID` and the next `searchResults` came
 * back with `data: null`, so `term/search` has to run again (and the
 * session's instructor codes are gone).
 */
export interface LookupErrorPage extends BannerErrorPage {
  openSSBInExperience: "";
  errorCode: "500";
  /**
   * HTML-escaped, also printed in the body under "Error Message:". Seen
   * here: "Cannot invoke method toInteger() on null object" (`offset` or
   * `max` missing), "first-result value cannot be negative : -10" (subject
   * `offset` "0"), "max-results cannot be negative" (subject `max` "-1"),
   * "For input string: &quot;abc&quot;" (a non-integer `offset` or `max`)
   * and "Cannot invoke method split() on null object" (partOfTerm without
   * `term`).
   */
  errorMessage: string;
}
