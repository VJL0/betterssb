/**
 * The two non-JSON answers of `courseSearchResults`. Both are full HTML
 * pages, so the response is a `string`; these are the data each carries.
 */

import type { BannerErrorPage } from "../common";

/**
 * Banner's 500 page (`text/html;charset=UTF-8`), from 20 captures. Like other
 * 500s it ends the session's term: the next `courseSearchResults` fails with
 * the `enrollmentDisplaySettings` message even after `resetDataForm`, until
 * `term/search` runs again.
 */
export interface CourseSearchResultsErrorPage extends BannerErrorPage {
  openSSBInExperience: "";
  errorCode: "500";
  /**
   * HTML-escaped, also printed in the body under "Error Message:". Seen:
   * "Cannot get property &#39;enrollmentDisplaySettings&#39; on null object"
   * (5,533 bytes; the session has no term), "Character x is neither a
   * decimal digit number, decimal point, nor &quot;e&quot; notation
   * exponential mark." (5,605 bytes; a credit hour that isn't a number) and
   * "URLDecoder: Incomplete trailing escape (%) pattern" (5,493 bytes; a `%`
   * in `txt_courseTitle` percent-encoded only once).
   */
  errorMessage: string;
}

/**
 * Temple's firewall page, 269 bytes (6 captures; status 200 on the 5 whose
 * status was logged): "The requested URL was rejected. Please consult with
 * your administrator.", titled "Request Rejected". It answered
 * `txt_courseTitle` values with a `%` followed by two hex digits once
 * encoded twice ("%29%" sent as "%252529%2525"). The session survives: the
 * next search worked (2 of 2).
 */
export interface RequestRejectedPage {
  title: "Request Rejected";
  /** "Your support ID is …": a UUID, new on every page. */
  supportId: string;
}
