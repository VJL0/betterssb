/**
 * `POST /ssb/term/search?mode=<mode>`, the Continue button of the term
 * selection page. It stores the picked term and the mode in the session
 * (keyed by the JSESSIONID cookie), then answers where to go next. Searches
 * need it first: `searchResults` echoes the mode as `pathMode` and returns
 * `data: null` for any term the session didn't pick.
 *
 * - No earlier page is needed; the first call sets the cookies (JSESSIONID,
 *   BIGipServer…, TS…). `X-Requested-With` is optional, and GET with the same
 *   fields in the query string does the same as POST.
 * - Every mode answers a guest, including registration, plan and preReg,
 *   whose `fwdURL` pages then redirect to sign-in; a search in that session
 *   still works and reports that mode.
 * - A later pick replaces the earlier one, and a refused pick (empty `term`)
 *   clears it. Opening `term/termSelection` also clears it, and so does any
 *   500 error page, which starts a new session (new JSESSIONID).
 */

import type { BannerDate } from "../search-results/index";
import type { TermForwardUrl, TermMode } from "./codes";

/** Query string. The fields go in the form body. */
export interface TermSearchQuery {
  /**
   * Missing or unknown modes are still a 200 with
   * `UnknownModeForwardUrl`, and the picked term searches with
   * `pathMode: null`.
   */
  mode?: TermMode;
}

/**
 * Form body (`application/x-www-form-urlencoded`). Banner's guest page always
 * sends `term`, `studyPath`, `studyPathText`, `startDatepicker`,
 * `endDatepicker` and `uniqueSessionId`, the dates and study path empty. The
 * advisor and PIN fields are left out (jQuery drops them) unless the page has
 * those inputs; sending them empty changes nothing for a guest.
 */
export interface TermSearchForm {
  /**
   * Comma-separated codes, as the page's select2 keeps them in its
   * `listofsearchterms` attribute; "202636,202703" makes both terms
   * searchable. Any string is accepted and forwarded: a view-only term
   * (201120) searches normally, a real term without classes (202836, or the
   * orientation term 202504) returns `data: []`, and junk ("999999", "abc")
   * `data: null`, with "Term: null" on the class search page. "202636 " works
   * like "202636". Empty without both dates is refused (`TermSearchRefused`).
   */
  term: string;
  /**
   * Banner's page sends "" for both; "1" / "Something" changed nothing for a
   * guest. Its JS would fill them from a `studyPath` list in the `saveTerm`
   * answer (`keySequenceNumber`, `studyPathName`), which never came.
   */
  studyPath?: string;
  studyPathText?: string;
  /**
   * "MM/DD/YYYY" or "". Any other format ("2027-01-15", "bad") is a 500
   * "Invalid start date", even next to a valid `term`. One date alone is
   * ignored: with a `term` the term is picked, without one the pick is
   * refused. With both, Banner answers the bare forward even for a range
   * without classes (01/1990) or reversed, but the session is dropped, even
   * when `term` was set too: the next request gets a new JSESSIONID (all 4
   * times), `searchResults` is `data: null` with `pathMode: null` for the
   * term, for `saveTerm`'s `maxterm` of the dates and for an empty `txt_term`
   * with the dates, and the class search page redirects. Temple runs with
   * `usingDates: false`, so Banner's page never sends dates.
   */
  startDatepicker?: BannerDate | "";
  endDatepicker?: BannerDate | "";
  /**
   * Banner's page sends 5 random characters + epoch ms from
   * `sessionStorage["xe.unique.session.storage.id"]`. Not checked: picks
   * without it, and searches with another one or none, work the same.
   */
  uniqueSessionId?: string;
  /** Sent "" by the signed-in registration page, which has `#input_alt_pin`. */
  altPin?: string;
  /** Advisor fields: `#txt_advisee`, `#stu_pin`, `#holdPassword`. */
  student?: string;
  stu_pin?: string;
  holdPassword?: string;
}

/**
 * Banner's page follows `fwdURL` when `regAllowed` and `studentEligValid` are
 * both missing or both true; otherwise it shows each `studentEligFailures`
 * line as an error.
 */
export type TermSearchResponse =
  TermSearchForward | TermSearchRefused | TermSearchIneligible;

/** Every accepted pick, guest or signed in, in every mode. */
export interface TermSearchForward {
  fwdURL: TermForwardUrl;
}

/**
 * A guest pick with an empty `term` and not both dates, in every mode (and
 * without one). The forward is the mode's page all the same.
 */
export interface TermSearchRefused {
  regAllowed: false;
  studentEligFailures: ["No Classes Found in this Date Range"];
  fwdURL: TermForwardUrl;
}

/**
 * Seen once, in the user's signed-in HARs with mode=registration, when the
 * registration checks failed ("Time tickets prevent registration at this
 * time."). Banner's page turns "\n" in a line into `<br/>`.
 */
export interface TermSearchIneligible {
  studentEligValid: false;
  studentEligFailures: string[];
  fwdURL: TermForwardUrl;
}
