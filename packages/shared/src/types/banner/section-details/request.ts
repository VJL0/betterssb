/**
 * Parameters of the class-details dialog tabs that describe one section:
 * `getClassDetails`, `getCourseDescription`, `getSectionCatalogDetails`,
 * `getSectionAttributes`, `getSectionBookstoreDetails`, `getFees` and
 * `getEnrollmentInfo`, all under `/ssb/searchResults/`. Their paths are the
 * `data-endpoint` of the dialog's `#classDetailsHeaders > h3` tabs, which
 * the class search and the course search pages both carry; the `h3` ids
 * (`classDetails`, `courseDescription`, `catalog`, `attributes`,
 * `bookstore`, `fees`, `enrollmentInfo`) are the `aria-labelledby` of the
 * fragment each tab returns.
 *
 * Each answers with an HTML fragment (`text/html;charset=UTF-8`, CRLF line
 * endings, starting "\r\n<section"), never JSON, so the response is a
 * `string`; the interfaces next to this file are the data each fragment
 * carries.
 *
 * None of them needs a session or a picked term: every tab returned the same
 * bytes with no cookies at all, with only the term-selection page's cookies,
 * and after `term/search`, and none sets a session cookie when it succeeds.
 * Each ignores `X-Requested-With`, and a GET with the same query string (or
 * a PUT) returns the same bytes as the POST. A past term (202536) answers
 * too, and so do sections the guest search never lists: 6 of 30 random CRNs
 * missing from Spring 2027's `searchResults` returned full tabs (all with no
 * one enrolled), the other 24 the error page.
 *
 * Anything that doesn't name one section of the term gets status 500 with
 * Banner's full HTML error page (`SectionTabErrorPage`), the same 6,809 bytes from
 * every tab, and ends the session it was sent in: a missing or empty `term`
 * or `courseReferenceNumber`, a CRN the term doesn't have ("99999"), an
 * unknown term ("199910"), junk ("abc"), a CRN with a leading zero, a
 * leading or trailing space or a "+" ("041859", " 41859", "41859 ",
 * "+41859"), a term with a trailing space, or the fields sent as a JSON
 * body. A CRN of another term is not an error: CRNs are only unique within
 * a term, so it describes whichever section has that CRN in the term sent.
 */

/**
 * Form body of every tab but Class Details. Banner's page sends it with
 * jQuery `.load(url, data)`, a urlencoded POST, reading both values from the
 * clicked row's `data-attributes` ("202703,41859"). It sends no
 * `uniqueSessionId`: its `$.ajaxPrefilter` only adds one to JSON-string
 * bodies, and these send objects.
 */
export interface SectionDetailsForm {
  /** Required. Six-digit term code ("202703"). */
  term: string;
  /** Required, exactly as `searchResults` spells it ("2001", "41859"). */
  courseReferenceNumber: string;
}

/** Form body of `getClassDetails`, the tab the dialog opens on. */
export interface ClassDetailsForm extends SectionDetailsForm {
  /**
   * Banner's page adds "first" for whichever tab opens the dialog, which at
   * Temple is always Class Details. The server ignores it: the fragment is
   * byte-for-byte the same without it.
   */
  first?: "first";
}
