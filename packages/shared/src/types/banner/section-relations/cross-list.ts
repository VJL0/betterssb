/**
 * `POST /ssb/searchResults/getXlstSections`, the "Cross List Sections" tab:
 * an HTML fragment, `<section aria-labelledby="xlstSections">`. The response
 * is a `string`; `CrossListSections` is the data it carries, or nothing when
 * it says "No cross list information available." (115 of 157 sampled: the
 * 108 sections with a null `crossList` and the 7 alone in their cross-list
 * group). Saved fragments are in
 * reverse-engineering/section-relations/getXlstSections/.
 */

export interface CrossListSections {
  /**
   * The number after `<span class="status-bold">Section Enrollment:</span>`:
   * this section's own `enrollment`, not the group's `crossListCount` (42 of
   * 42, against the `first=first` section fetched alongside).
   */
  sectionEnrollment: number;
  /**
   * Rows of the plain `<table>` after "Sections:": every other section of the
   * group and never this one (42 of 42). Sorted by CRN in 35 of 42; 1 to 10
   * rows.
   */
  sections: CrossListedSection[];
}

/**
 * One row. Each column matched the listed section's class search row (127
 * of 127), HTML-escaped the same way.
 */
export interface CrossListedSection {
  /** "CRN" column: the listed section's `courseReferenceNumber`. */
  crn: string;
  /** "Subject" column: its `subjectDescription` ("Asian Studies"), not the code. */
  subject: string;
  /** "Course Number" column. */
  courseNumber: string;
  /** "Title" column: its full `courseTitle`. */
  title: string;
  /** "Section" column: its `sequenceNumber` ("750"). */
  section: string;
}
