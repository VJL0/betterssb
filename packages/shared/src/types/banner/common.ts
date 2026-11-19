/**
 * Shapes shared by more than one reverse-engineered endpoint group.
 */

/**
 * A code list left open (`| (string & {})`) because Banner admins add codes
 * between terms; the known members are there for autocomplete.
 */
export type Open<Known extends string> = Known | (string & {});

/**
 * One option of a Banner lookup (terms, subjects, campuses…). `description`
 * is HTML-escaped ("Adult &amp; Organizational Develop").
 */
export interface CodeDescription<Code extends string = string> {
  code: Code;
  description: string;
}

/**
 * Banner's 404 and 500 pages. Both are full HTML pages titled "Banner"
 * (`text/html;charset=UTF-8`), never JSON, even for an AJAX request that
 * accepts only JSON, so the response is a `string`; this is the data their
 * `<head>` carries. Seen on 2026-11-18 from guest sessions: four 404 pages
 * (plus two bare 404s) and five 500s.
 *
 * - **404**, 4,959 bytes, "Sorry, This page is not available.": an unknown
 *   action of a known controller (`/ssb/term/doesNotExist`,
 *   `/ssb/registration/doesNotExist`, `/ssb/selfServiceMenu/pageName`). An
 *   unknown controller or a path outside `/ssb` (`/ssb/doesNotExist`,
 *   `/StudentRegistrationSsb/doesNotExist`) is a 302 to the CAS login
 *   instead. A missing file under `/assets/` and an unknown
 *   `theme/getTheme` name are bare 404s with an empty body.
 * - **500**, "Sorry, the server received an internal error. Error Message:"
 *   followed by the Groovy exception: `classSearch/getTerms` with no query
 *   (5,487 bytes), the landing page's disabled `curriculumInfoLink`,
 *   `/ssb/term/termSelection` with no `mode` (5,393 bytes, empty message),
 *   and `dateConverter` without its locales (5,575 bytes).
 *
 * A 500 ends the session: it answers with a new `JSESSIONID` and clears
 * `grails_remember_me` (5 of 5), so the term is gone (the next
 * `searchResults` has `data: null`, `classSearch/classSearch` redirects to
 * the landing page) and `term/search` has to run again. A 404 sets no cookie
 * and leaves the session alone.
 */
export interface BannerErrorPage {
  viewport: "width=device-width, initial-scale=1";
  menuBaseURL: "/StudentRegistrationSsb/ssb";
  /** "false" on the 404 page, empty on the 500 page. */
  openSSBInExperience: "false" | "";
  layout: "bannerCommonPage";
  errorCode: "404" | "500";
  /**
   * The 404's fixed text, or the 500's exception message, HTML-escaped and
   * printed again in the body ("Cannot invoke method toInteger() on null
   * object"); empty for some 500s. Each group's own error page lists the
   * messages its routes give. A failed Groovy `assert` keeps its
   * line breaks: "Handler dispatch failed: Assertion failed: \n\nassert
   * fromULocaleString\n       |\n       null\n".
   */
  errorMessage: string;
}
