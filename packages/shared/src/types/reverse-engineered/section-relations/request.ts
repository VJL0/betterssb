/**
 * Parameters of the class-details dialog tabs that relate a section to other
 * courses and sections. Banner's search results page reads `term` and
 * `courseReferenceNumber` from the clicked row and sends nothing else: no
 * `uniqueSessionId` (its `$.ajaxPrefilter` only adds one to JSON-string
 * bodies, and these send objects).
 *
 * None of the tabs needs a session or a picked term: every tab answered the
 * same with no cookies at all, with a fresh session, and after `term/search`,
 * and each ignores the `X-Requested-With` header. A session only matters for
 * the instructors' `bannerId`, which it keeps stable (see
 * `MeetingInstructor`), and so for the contact card, which needs one.
 *
 * A missing `term` or `courseReferenceNumber`, a CRN the term doesn't have, an
 * unknown term or junk ("abc", "x'y") gets status 500 with Banner's full HTML
 * error page (`SectionRelationErrorPage`), never an empty fragment or JSON.
 */

/**
 * Form body of `POST /ssb/searchResults/getRestrictions`,
 * `getSectionPrerequisites`, `getCorequisites`, `getCourseMutuallyExclusions`
 * and `getXlstSections`, and of the two tabs Temple's page doesn't render,
 * `getLinkedSections` and `getSyllabus`. Banner's page sends it with jQuery
 * `.load(url, data)`, a urlencoded POST; a GET with the same query string
 * returns the same fragment byte for byte.
 */
export interface SectionTabForm {
  /** Required. Six-digit term code ("202703"). */
  term: string;
  /** Required, and must be a CRN of `term`. */
  courseReferenceNumber: string;
}

/**
 * Query of `GET /ssb/searchResults/getFacultyMeetingTimes`. Banner's page uses
 * `$.getJSON`; a urlencoded POST of the same fields returns the same JSON.
 */
export interface FacultyMeetingTimesQuery extends SectionTabForm {
  /**
   * "first" adds the `section` object to the response
   * (`FacultyMeetingTimesWithSection`) and changes nothing else. Banner's page
   * sends it only when this tab is the first in the dialog; at Temple the
   * first tab is Class Details, so its own page never does.
   */
  first?: "first";
}

/**
 * Query of `GET /ssb/searchResults/fetchLinkedSections`, the path in
 * `#viewAllLinkedSectionsUrl`'s `data-endpoint`. Banner's page calls it with
 * `$.ajax` (a GET) from a "View Linked Sections" button
 * (`button[id*=viewAllLinkedSections]`, whose `data-attributes` is
 * "term,crn,title,creditHourLow,scheduleTypeDescription") that none of the
 * downloaded bundles renders; POST works too.
 */
export interface LinkedSectionsQuery extends SectionTabForm {
  /**
   * Copied from an add button's `data-structure-sequence` and
   * `data-structure-parent` when it has both; never sent from the guest
   * pages, which have no add buttons.
   */
  dataStructureSequence?: string;
  dataStructureParent?: string;
}

/**
 * Query of `GET /ssb/contactCard/retrieveData`, the path in
 * `#getContactCard`'s `data-endpoint`. Banner's profileCard script sends it
 * with `$.ajax` (a GET) when an instructor's name is clicked, with nothing
 * else. Unlike the tabs it needs the session that produced the `bannerId`:
 * without cookies, or after a 500 replaced the session, the same id gets
 * `ContactCardErrorPage`. The session needn't have picked a term.
 */
export interface ContactCardQuery {
  /**
   * Required. The session-scoped `bannerId` of a `MeetingInstructor`
   * (Instructor/Meeting Times tab) or of the class search row's `faculty`
   * (results grid), from the same session.
   */
  bannerId: string;
  /**
   * Required. The dialog's term (`#accordion[term]`) or the row's `term`.
   * Another term returned the same card byte for byte (1 probe).
   */
  termCode: string;
}
