/**
 * Constants of the term-selection routes: the `mode` values Banner's pages
 * use, where `term/search` forwards each one, and the season suffixes of term
 * codes.
 */

import type { Open } from "../common";

/**
 * `fwdURL` of `term/search` for each `mode`. The mode is case-sensitive;
 * "Search", "bogus" or no mode at all forward to `UnknownModeForwardUrl`.
 * The registration, plan and preReg pages are a 302 to the CAS sign-in at
 * fim.temple.edu for a guest, even right after a pick in that mode.
 */
export interface TermModeForwardUrls {
  search: "/StudentRegistrationSsb/ssb/classSearch/classSearch";
  courseSearch: "/StudentRegistrationSsb/ssb/courseSearch/courseSearch";
  registration: "/StudentRegistrationSsb/ssb/classRegistration/classRegistration";
  plan: "/StudentRegistrationSsb/ssb/plan/selectPlan";
  preReg: "/StudentRegistrationSsb/ssb/prepareRegistration/prepareRegistration";
}
export type TermMode = keyof TermModeForwardUrls;

/**
 * Banner fills a missing or unknown `mode` in as the string "null", twice.
 * The page is a 302 to the CAS sign-in for a guest.
 */
export type UnknownModeForwardUrl = "/StudentRegistrationSsb/ssb/null/null";

export type TermForwardUrl =
  TermModeForwardUrls[TermMode] | UnknownModeForwardUrl;

/**
 * Last two digits of a term code ("202636" is 2026 Fall), with the season
 * name Banner puts after the year in the description. The orientation terms
 * appear only in the `courseSearch` list.
 */
export interface TermSeasonDescriptions {
  "03": "Spring";
  /** "2021 Spring Orientation" (202104) is the one without " Term". */
  "04": "Spring Orientation Term";
  "20": "Summer I";
  "26": "Summer II";
  "36": "Fall";
  "37": "Fall Orientation Term";
}
export type TermSeason = Open<keyof TermSeasonDescriptions>;
