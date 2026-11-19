/**
 * The "Catalog" tab, `POST /ssb/searchResults/getSectionCatalogDetails`: the
 * catalog entry of the section's course, as of the section's term.
 */

import type {
  ScheduleType,
  SectionAttributeCode,
} from "../search-results/index";
import type { CodeLine } from "./code-line";
import type { College, Division, GradingMode, Level } from "./codes";

/**
 * Data carried by the Catalog fragment (1,236 to 1,591 bytes): one `<section
 * aria-labelledby="catalog">` of `<span class="status-bold">` labels, every
 * one of them on all 156 sections, in this order. College, Division and
 * Department each sit in their own conditional block, though none was ever
 * left out. Lists are `<div class="indent-left">` blocks of
 * "Description  CODE" lines joined by `<br/>`, sorted by code; read them as
 * `CodeLine`s.
 */
export interface SectionCatalogDetails {
  /**
   * "Title:" label, plain text after the label (no `<span>`): the course's
   * catalog title, not the section's, so it differed from Class Details'
   * `courseTitle` for 13 of 156 ("Special Topics" for a section titled
   * "Special Topics: …"). Can hold runs of two spaces, as in
   * "Health Care Law:  Bioethics".
   */
  title: string;
  /** "College:" label, in a `<span>` ("Science &amp; Technology  ST"). */
  college: CodeLine<College>;
  /** "Division:" label, in a `<span>`. */
  division: CodeLine<Division>;
  /**
   * "Department:" label, in a `<span>`. The code is four digits ("1312",
   * "0705"); the description usually starts with a college prefix and a
   * colon, with or without a space ("CST:Biology", "TUSM: School Of
   * Medicine"), and 6 of 156 had none ("Vice Provost Undergrad Studies").
   */
  department: CodeLine;
  /**
   * The `<span class="credit-hours-direction">` after "Credit Hours:" under
   * the "Hours:" label, trimmed: `creditHourLow`, then the indicator and
   * `creditHourHigh` when there is one ("3", "2.5", "1 TO 6", "0 OR 4"),
   * matching the `searchResults` row for all 150 listed sections and
   * ignoring its `creditHours` (Class Details shows "3" where this says
   * "2 TO 4"). "0" for a zero-credit section. A single number is padded
   * with two spaces in the markup ("3  ").
   */
  creditHours: string;
  /**
   * "Other:" line in the `<div class="indent-left">` under "Credit Hours:",
   * trimmed ("4"). Seen once, on the "0 OR 4" section; the div otherwise
   * holds three empty slots, and no other line was seen in them.
   */
  otherHours?: string;
  /** "Levels:" label; 1 to 3 lines ("NonDegree Continuing Undergrad  NU"). */
  levels: CodeLine<Level>[];
  /** "Grading Modes:" label; 1 to 3 lines. */
  gradingModes: CodeLine<GradingMode>[];
  /**
   * "Schedule Types:" label; one line for 153 of 156, two for a course
   * whose sections come in two kinds
   * ("Lecture and Lab  LL", "Recitation  REC"). Always includes the
   * section's own schedule type.
   */
  scheduleTypes: CodeLine<ScheduleType>[];
  /**
   * "Attributes:" label, 0 to 6 lines; the div is empty when there are none
   * (97 of 156). The same list as the Attributes tab for 155 of 156; the
   * other section had "Anonymous Grading  ANON" there and none here.
   */
  attributes: CodeLine<SectionAttributeCode>[];
}
