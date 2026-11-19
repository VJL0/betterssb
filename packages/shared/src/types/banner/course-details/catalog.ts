/**
 * The Catalog tab, `POST /ssb/courseSearchResults/getCourseCatalogDetails`,
 * the tab the dialog opens on.
 */

import type { CodeDescription } from "../common";
import type { ScheduleType } from "../search-results/index";
import type { College, Division, GradingMode, Level } from "./codes";
import type { CourseIdentity } from "./course-identity";

/**
 * Data carried by the Catalog fragment, a `<section
 * aria-labelledby="catalog">` of `<span class="status-bold">` labels, each
 * followed by its value. Every label below was on every course sampled, in
 * this order; the fragment always ends with `CourseIdentity`'s hidden spans.
 * Values that pair a description with a code print them as "Description
 * CODE", two spaces apart ("Science &amp; Technology  ST").
 *
 * An unknown course, or a term before its first catalog version, gets 500
 * and `CourseCatalogErrorPage` instead.
 *
 * The section dialog's version (`searchResults/getSectionCatalogDetails`)
 * has the same lines plus an "Attributes:" line, prints the title without a
 * `<span>` and the grading modes and schedule types as `<br/>`-joined text,
 * and has no hidden spans.
 */
export interface CourseCatalogDetails {
  /** "Title:" label; the full title, not the abbreviated one. */
  title: string;
  /** "College:" label ("Medicine, Lewis Katz School  ME"). */
  college: CodeDescription<College>;
  /** "Division:" label. */
  division: CodeDescription<Division>;
  /**
   * "Department:" label. The description starts with a college prefix
   * for 170 of 178 ("CST:Computer &amp; Info Sci", "Law: Beasley School of
   * Law"; not "Vice Provost Undergrad Studies"); the code is four digits
   * ("1322").
   */
  department: CodeDescription;
  /**
   * "Credit Hours:" line under "Hours:", trimmed: one number ("3", "1.5"),
   * a range ("1 TO 6") or a choice ("0 OR 4"). Banner pads a single number
   * with two spaces ("3  "), where the indicator and high value would go.
   */
  creditHours: string;
  /**
   * "Other:" line in the `<div class="indent-left">` under "Credit Hours:",
   * trimmed ("4"). Only the four "0 OR 4" courses had one, all "4" (BIOL
   * 1111, PHYS 1031, PHYS 1061, PHYS 1062); the div is otherwise empty (three blank slots, presumably for
   * lecture, lab and other hours, though no lecture or lab line was seen).
   */
  otherHours?: string;
  /** "Levels:" label, one per line, sorted by code; 1 to 4 lines. */
  levels: CodeDescription<Level>[];
  /** "Grading Modes:" label, sorted by code; 1 to 3 lines. */
  gradingModes: CodeDescription<GradingMode>[];
  /**
   * "Schedule Types:" label, the same codes and descriptions as the class
   * search's ("Lecture and Lab  LL"), sorted by code. One for 166 of 178;
   * a course whose sections come in two kinds lists both ("Lecture and Lab
   * LL", "Recitation  REC").
   */
  scheduleTypes: CodeDescription<ScheduleType>[];
  courseIdentity: CourseIdentity;
}
