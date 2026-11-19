import type { BannerErrorPage } from "../common";

/**
 * What every endpoint in this folder returns, the JSON ones included, with
 * status 500 and `text/html;charset=UTF-8`, when the section can't be
 * resolved: Banner's full "Sorry, the server received an internal error."
 * page (titled "Banner"), not a fragment. The response is a `string`; this is
 * the data its `<head>` carries. Seen on all 54
 * bad-parameter probes (six kinds of bad input against nine endpoints).
 */
export interface SectionRelationErrorPage extends BannerErrorPage {
  /** "500" on every one seen. */
  errorCode: "500";
  /**
   * `<meta name="errorMessage">`, HTML-escaped, a Groovy exception message
   * that is also printed in the page body. Two were seen, depending on the
   * endpoint and what was wrong:
   *
   * - "Ambiguous method overloading for method
   *   net.hedtech.banner.student.schedule.SectionDecorator#&lt;init&gt;.…"
   *   (nine lines, the last seven naming one class each; a 6,809-byte
   *   page) from every endpoint when the term is good but the CRN is
   *   missing or not in it, and from every endpoint but `getRestrictions`
   *   when the term is missing, unknown or junk.
   * - "Cannot get property &#39;levelSeverity&#39; on null object" (a
   *   5,509-byte page) from `getRestrictions` when the term is missing
   *   (with or without the CRN), unknown or junk.
   */
  errorMessage: string;
}

/**
 * `contactCard/retrieveData`'s 500 page (5,929 bytes), for a missing
 * `bannerId` or `termCode` and for a `bannerId` the current session didn't
 * hand out: one from another session, one sent without cookies, "99999999",
 * and any after a 500 has replaced the session. Seen on 4 probes here and 3
 * in discovery's.
 */
export interface ContactCardErrorPage extends BannerErrorPage {
  errorCode: "500";
  openSSBInExperience: "";
  /**
   * "No signature of method: grails.validation.ValidationException.returnMap()
   * is applicable for argument types:
   * (n.h.b.s.r.ContactCardController$_retrieveData_closure2) values:
   * [net.hedtech.banner.student.registration.ContactCardController$_retrieveData_closure2@15b6302b]",
   * the hash after "@" differing each time: the controller's own error
   * handling fails, so the real reason never shows.
   */
  errorMessage: string;
}
