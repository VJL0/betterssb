/**
 * The Restrictions tab, `POST /ssb/courseSearchResults/getRestrictions`.
 */

import type { CodeDescription, Open } from "../common";
import type { CourseIdentity } from "./course-identity";

/**
 * Data carried by the Restrictions fragment, a `<section
 * aria-labelledby="restrictions">` of bold headings ("Must be enrolled in one
 * of the following Levels:"), each followed by its values, or the text "No
 * course restriction information is available." (also for an unknown course
 * or a bad form; always 200). 87 of 178 courses had at least one heading.
 *
 * These are the course's catalog restrictions. The section dialog's
 * `searchResults/getRestrictions` adds the section's own: it opens with "Not
 * all restrictions are applicable.", and nearly every section adds "Cannot
 * be enrolled in one of the following Campuses: Japan (JPN)" and sometimes
 * "Special Approvals:" ("Permission of Advisor"), neither of which a
 * catalog tab showed. It also drops the space before some codes
 * ("Medicine(ME)") that the catalog version always has.
 */
export interface CourseRestrictions {
  /**
   * One per heading, at most one per category: Levels first and Attributes
   * last whenever present. Empty for the no-information text. Up to three
   * seen (6 courses).
   */
  restrictions: CourseRestriction[];
  courseIdentity?: CourseIdentity;
}

/**
 * A `<span class="status-bold">` heading and the `<span
 * class="detail-popup-indentation">` values under it, each followed by
 * `<br/>`.
 */
export interface CourseRestriction {
  /**
   * The heading's first words: "Must be enrolled in" admits only students
   * who match a value, "Cannot be enrolled in" turns them away (5 of 123
   * headings: graduate students out of an undergraduate course, first-year
   * students out of an upper-level one).
   */
  rule: "Must be enrolled in" | "Cannot be enrolled in";
  /** The heading's last words, between "the following " and the colon. */
  category: CourseRestrictionCategory;
  /**
   * One per value, "Graduate (GR)" split into description and code, sorted
   * by code. Usually one value (100 of 123 headings); a Fields of Study
   * heading listed up to 31. A description with commas is split over
   * several spans, the later ones starting with a space, and only the last
   * carries the code ("Art Architecture" then " Tyler School (TA)"); here
   * they are joined back with ", ". HTML-escaped ("Music &amp; Dance, Boyer
   * College").
   */
  values: CodeDescription[];
}

/**
 * Categories seen, with example codes: Levels ("GR", "LW"), Colleges ("BU",
 * the same as the Catalog's "College:"), Degrees ("BFA", "MD"), Programs
 * ("HP-OTHR-DOT"), Majors ("PA"), Fields of Study ("ACCT"), Classes ("1",
 * "L2"), Cohorts ("UHONORS") and student Attributes ("DWS", "CLER").
 */
export type CourseRestrictionCategory = Open<
  | "Attributes"
  | "Classes"
  | "Cohorts"
  | "Colleges"
  | "Degrees"
  | "Fields of Study (Major, Minor or Concentration)"
  | "Levels"
  | "Majors"
  | "Programs"
>;
