import type { BannerErrorPage } from "../common";

/**
 * What every tab in this folder returns, with status 500 and
 * `text/html;charset=UTF-8`, when the form doesn't name a section of the
 * term: Banner's full "Sorry, the server received an internal error." page
 * (6,809 bytes, titled "Banner"), not a fragment. The response is a
 * `string`; this is the data its `<meta>` tags carry, the same on all 72
 * captured (from all seven tabs) but for the order of the class names in
 * `errorMessage`.
 *
 * Inside a session the 500 also ends that session: it answers with a new
 * `JSESSIONID` and clears `grails_remember_me`, and the next
 * `searchResults` of the same `uniqueSessionId` comes back with `data:
 * null` until `term/search` runs again. A tab that answers 200 sets no
 * session cookie.
 */
export interface SectionTabErrorPage extends BannerErrorPage {
  /** Empty on every 500 seen. */
  openSSBInExperience: "";
  errorCode: "500";
  /**
   * HTML-escaped Groovy exception message, printed again in the body under
   * "Error Message:". Always nine lines: "Ambiguous method overloading for
   * method net.hedtech.banner.student.schedule.SectionDecorator#&lt;init&gt;.",
   * "Cannot resolve which method to invoke for [null] due to overlapping
   * prototypes between:" and seven tab-indented class names
   * ("\t[class net.hedtech.banner.student.schedule.Section]"), which came in
   * three different orders.
   */
  errorMessage: string;
}
