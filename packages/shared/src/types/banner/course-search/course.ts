/**
 * One row of `courseSearchResults`: a course as the catalog has it for the
 * searched term. Written from all 38,632 rows of the three full catalogs:
 * 2026 Summer I (12,768), 2026 Fall (12,947) and 2027 Spring (12,917). Every
 * key was on every row, and the keys typed `null` were null on all of them.
 * Rows come sorted by `subjectDescription`, then `courseNumber`, in
 * code-point order of the sent text, one row per subject and course number.
 */

import type { CreditHourIndicator } from "../search-results/codes";
import type {
  CatalogCollegeCode,
  CatalogDivision,
  PrerequisiteCheckMethod,
} from "./codes";

export interface CatalogCourse {
  /**
   * One version of a course: each of the 13,791 ids seen was always the same
   * `subjectCode`, `courseNumber` and `termEffective`, so a course that didn't
   * change between terms keeps its id.
   */
  id: number;
  /**
   * Term code of the version in effect ("202336"): never after the searched
   * term, and equal to it on 35 Summer I, 952 Fall and 67 Spring rows.
   */
  termEffective: string;
  /**
   * Four characters: four digits (35,221 rows), an upper-case letter and
   * three digits ("E000", "M495"; 3,348) or "SESS" (63).
   */
  courseNumber: string;
  /** Always equal to `courseNumber`. */
  courseDisplay: string;
  /** Two to four upper-case letters ("AS", "ACCT"). */
  subject: string;
  /** Always equal to `subject`. */
  subjectCode: string;
  /**
   * Not HTML-escaped, unlike the `get_college` lookup ("Music & Dance,
   * Boyer College"); "No College Designated" for "00". One name per code.
   */
  college: string;
  collegeCode: CatalogCollegeCode;
  /**
   * Not HTML-escaped ("CLA:Modern Lang/Lit/Cultures", "Law: Beasley School
   * of Law"). Null on 69 rows (23 courses in each term), always together
   * with `departmentCode`.
   */
  department: string | null;
  /**
   * Four digits ("1902"). Each code has one name, but six names have two
   * codes ("CLA: College of Liberal Arts" is 1800 and 1801).
   */
  departmentCode: string | null;
  /**
   * HTML-escaped ("Women&#39;s", "&amp;", "&nbsp;"); at most 100 characters
   * once unescaped. 426 rows have spaces at either end.
   */
  courseTitle: string;
  durationUnit: null;
  numberOfUnits: null;
  attributes: null;
  gradeModes: null;
  /** `false` on 9,712 rows, null on the rest. */
  ceu: false | null;
  courseScheduleTypes: null;
  courseLevels: null;
  /**
   * Upper end of a variable credit value, always above `creditHourLow`; null
   * on the 33,523 rows that have one value.
   */
  creditHourHigh: number | null;
  /** Fractional on 361 rows (1.5, 0.5, 2.5, 4.5); 0 on 2,154. */
  creditHourLow: number;
  /**
   * Null exactly when `creditHourHigh` is; "TO" on 4,855 rows, "OR" on
   * 254.
   */
  creditHourIndicator: CreditHourIndicator | null;
  lectureHourLow: null;
  lectureHourHigh: null;
  lectureHourIndicator: null;
  /** Always equal to `creditHourLow`. */
  billHourLow: number;
  /** Always equal to `creditHourHigh`. */
  billHourHigh: number | null;
  /** Always equal to `creditHourIndicator`. */
  billHourIndicator: CreditHourIndicator | null;
  /** 0 on 39 rows (13 courses in each term), null on the rest. */
  labHourLow: 0 | null;
  labHourHigh: null;
  labHourIndicator: null;
  otherHourLow: null;
  otherHourHigh: null;
  otherHourIndicator: null;
  /** The text is in `courseDescription`. */
  description: null;
  /**
   * HTML-escaped ("Adult &amp; Organizational Develop"), the same as the
   * `get_subject` lookup's description for the code.
   */
  subjectDescription: string;
  /**
   * A preview: at most the first 100 characters of the description, cut
   * wherever the 100th falls, then HTML-escaped, so up to 128 characters
   * ("&lt;p&gt;", "&#39;", "&quot;"); 21,469 rows are exactly 100 once
   * unescaped. 3,111 have spaces at either end. Null on every 2027 Spring
   * row, and on 1,503 Summer I and 1,500 Fall rows. The course details'
   * Course Description tab (`course-details`) has the text in full.
   */
  courseDescription: string | null;
  division: CatalogDivision;
  /**
   * Term code of the course's first version: the same on every version of a
   * course, never after `termEffective` and equal to it on 25,214 rows.
   */
  termStart: string;
  /**
   * The first term the version is no longer in effect: "999999" on 38,468
   * rows, otherwise a later term ("202703" on a Fall row whose course isn't
   * in Spring's catalog). Always after the searched term.
   */
  termEnd: string;
  preRequisiteCheckMethodCde: PrerequisiteCheckMethod;
  /**
   * Banner's page reads it only in `plan` mode, where with
   * `isPlanByCrnSetForTerm` a falsy value replaces the "View Sections" button
   * with a not-offered-for-term note.
   */
  anySections: null;
}
