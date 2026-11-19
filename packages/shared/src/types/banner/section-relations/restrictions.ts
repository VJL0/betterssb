/**
 * `POST /ssb/searchResults/getRestrictions`, the "Restrictions" tab: an HTML
 * fragment, `<section aria-labelledby="restrictions">`. The response is a
 * `string`; `Restriction[]` is the data it carries, one per bold heading in
 * Banner's order. Saved fragments are in
 * reverse-engineering/section-relations/getRestrictions/.
 *
 * Every fragment seen starts with `<div class="infoicon">` "Not all
 * restrictions are applicable." and has at least one heading: no section of
 * the sample was unrestricted, because Temple bars Japan-campus students
 * ("Cannot be enrolled in one of the following Campuses: Japan (JPN)") from
 * almost every non-Japan section. Each heading is a
 * `<span class="status-bold">`, each value under it a
 * `<span class="detail-popup-indentation">`, all followed by `<br/>`; the
 * Fields of Study block adds a stray `</br>`.
 */

import type { CodeDescription, Open } from "../common";

export type Restriction = EnrollmentRestriction | SpecialApprovals;

/** A heading "Must be enrolled in one of the following Levels:" and its values. */
export interface EnrollmentRestriction {
  /**
   * The heading's first words: "Must be" admits only students who match one
   * value, "Cannot be" turns them away.
   */
  rule: "Must be" | "Cannot be";
  /** The heading's last words, before the colon. */
  category: RestrictionCategory;
  /**
   * One per value, "Graduate (GR)" split into description and code. The code
   * is the last parenthesized part; the space before it is missing on some
   * values ("Law(LW)", "Senior 90 to 119 Credits(4)"). Banner splits a
   * description at its commas into separate spans, the later ones starting
   * with a space, and puts the code on the last one only: the college "Art
   * Architecture, Tyler School (TA)" arrives as "Art Architecture" and
   * " Tyler School (TA)". Descriptions are HTML-escaped ("Music &amp; Dance,
   * Boyer College").
   */
  values: CodeDescription[];
}

/** The "Special Approvals:" heading. */
export interface SpecialApprovals {
  rule: "Special Approvals";
  /** Plain text without codes ("Permission of Instructor"). */
  values: string[];
}

/**
 * Categories seen, with example codes: Levels ("GR"), Classes ("1", "L3"),
 * Colleges ("TA"), Departments ("1221"), Degrees ("DPT"), Programs
 * ("TA-ARTE-MED"), Majors ("MUED"), Fields of Study ("ACCT"), Campuses
 * ("JPN"), Cohorts ("KYOTO", "S01 ROME") and student Attributes ("DWS").
 */
export type RestrictionCategory = Open<
  | "Attributes"
  | "Campuses"
  | "Classes"
  | "Cohorts"
  | "Colleges"
  | "Degrees"
  | "Departments"
  | "Fields of Study (Major, Minor or Concentration)"
  | "Levels"
  | "Majors"
  | "Programs"
>;
