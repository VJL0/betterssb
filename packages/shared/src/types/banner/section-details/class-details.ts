/**
 * The "Class Details" tab, `POST /ssb/searchResults/getClassDetails`, the tab
 * the class-details dialog opens on.
 */

import type { ClassDetailsGradeMode } from "./codes";

/**
 * Data carried by the Class Details fragment (1,144 to 1,371 bytes): one
 * `<section aria-labelledby="classDetails">` of `<span class="status-bold">`
 * labels, each followed by its value and a `<br/>`, always in this order.
 * Banner's page reads `#courseTitle`, `#subject`, `#courseDisplay` and
 * `#sectionNumber` from it for the dialog's title.
 *
 * For all 150 sampled sections that `searchResults` lists, every value but
 * the credit hours and the grade mode is that section's row, HTML-decoded,
 * so only `gradeMode` is new. Values are the elements' trimmed text; the
 * markup leaves a space before some `<br/>` ("2027 Spring ").
 */
export interface ClassDetails {
  /** "Associated Term:" label; the row's `termDesc` ("2027 Spring"). */
  associatedTerm: string;
  /** `<span id="courseReferenceNumber">` after the "CRN:" label. */
  courseReferenceNumber: string;
  /**
   * "Campus:" label; the row's `campusDescription` decoded ("Church
   * Teacher's College").
   */
  campus: string;
  /**
   * "Schedule Type:" label, on every section seen; the row's
   * `scheduleTypeDescription` decoded ("Law Guided Research & Writing").
   */
  scheduleType: string;
  /**
   * "Instructional Method:" label; the row's
   * `instructionalMethodDescription` decoded. The whole line is left out
   * when that is null (1 of 156, a School of Medicine elective).
   */
  instructionalMethod?: string;
  /**
   * `<span id="sectionNumber">` after "Section Number:"; the row's
   * `sequenceNumber` ("001", "O07", "T03"), three characters for 151 of 156.
   */
  sectionNumber: string;
  /**
   * `<span id="subject">` after "Subject:": the subject's description, not
   * its code ("Juris Doctor", "Earth & Environmental Science").
   */
  subject: string;
  /**
   * `<span id="courseNumber" style="display:none;">`, hidden; equal to
   * `courseDisplay` on every section.
   */
  courseNumber: string;
  /**
   * `<span id="courseDisplay">`, the course number shown after "Course
   * Number:" ("0508", "M905").
   */
  courseDisplay: string;
  /**
   * `<span id="courseTitle">` after "Title:": the section's title, which a
   * topics or clerkship section overrides ("Special Topics in German Hist:
   * Fascist Aesthetics", "Pathology 07"), so it differed from the Catalog tab's
   * `title` for 13 of 156. Can hold runs of two spaces.
   */
  courseTitle: string;
  /**
   * "Credit Hours:" label, trimmed. Numbers print without a trailing ".0"
   * ("3", "2.5"). Which value shows depends on the row's credit fields, for
   * all 150 listed sections:
   *
   * - `creditHours` set and not 0: that number alone, even for a range
   *   ("3" for a "2 TO 4" section); 19 sections.
   * - Otherwise a "TO" range, `creditHourLow` "TO" `creditHourHigh`
   *   ("1 TO 6"), the only case wrapped in `<span
   *   class="credit-hours-direction">`; 16.
   * - Otherwise `creditHourLow`, or `creditHourHigh` when the low is 0
   *   ("4" for a "0 OR 4" section); 105 and 1.
   * - Empty when the section has 0 credits and no high value, where the
   *   Catalog tab says "0"; 9 (11 of all 156).
   */
  creditHours: string;
  /**
   * "Grade Mode:" label. A set grade mode was one of the Catalog tab's
   * `gradingModes` for 34 of 35 sections; the other was "Standard Letter
   * Grade" on a course whose catalog lists only "Pass / Fail".
   */
  gradeMode: ClassDetailsGradeMode;
}
