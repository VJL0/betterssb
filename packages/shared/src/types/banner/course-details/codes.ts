/**
 * Code lists seen on the Catalog tab of 178 courses from 2026 Summer I, 2026
 * Fall and 2027 Spring, each left `Open`. Descriptions are spelled exactly as
 * Banner prints them, HTML escapes included. Schedule types and attributes
 * reuse the class search's lists (`ScheduleTypeDescriptions`,
 * `SectionAttributeDescriptions`), whose codes and descriptions matched every
 * catalog one.
 */

import type { Open } from "../common";

/**
 * "College:" line, and the values of a "Colleges" restriction: the 17
 * colleges of `courseSearch/get_college` plus PV and GS, which that lookup
 * leaves out.
 */
export interface CollegeDescriptions {
  BC: "Music &amp; Dance, Boyer College";
  BU: "Business &amp; Mngmnt, Fox School";
  CA: "Theater, Film &amp; Media Arts";
  CO: "Media &amp; Comm, Klein College";
  DN: "Dentistry, Kornberg School";
  ED: "Education &amp; Human Development";
  EN: "Engineering";
  GS: "Graduate School";
  HP: "College of Public Health";
  LA: "Liberal Arts";
  LW: "Law, Beasley School";
  ME: "Medicine, Lewis Katz School";
  PH: "Pharmacy";
  PV: "Provost";
  ST: "Science &amp; Technology";
  SW: "Social Work";
  TA: "Art Architecture, Tyler School";
  TH: "Sport Tourism Hospitality Mgt";
  UC: "University College";
}
export type College = Open<keyof CollegeDescriptions>;

/**
 * "Division:" line. `courseSearch/get_division` lists only GR and UG; the
 * professional schools have their own.
 */
export interface DivisionDescriptions {
  DN: "Dentistry";
  GR: "Graduate";
  LW: "Law";
  ME: "Medicine";
  PH: "Pharmacy";
  UG: "Undergraduate";
}
export type Division = Open<keyof DivisionDescriptions>;

/**
 * "Levels:" lines, and the values of a "Levels" restriction. NU rides along
 * with UG: it was on 110 of the 158 undergraduate courses and never alone.
 */
export interface LevelDescriptions {
  DN: "Dentistry";
  GR: "Graduate";
  LG: "Law Graduate";
  LW: "Law";
  ME: "Medicine";
  NU: "NonDegree Continuing Undergrad";
  PB: "Postbaccalaureate";
  PH: "Pharmacy";
  UG: "Undergraduate";
}
export type Level = Open<keyof LevelDescriptions>;

/** "Grading Modes:" lines. S was on 159 of 178 courses, C on 92, P on 55. */
export interface GradingModeDescriptions {
  C: "Credit/No Credit";
  I: "Law - International";
  K: "GR Level P/F/R In-Progress";
  N: "GR Level Credits in Progress";
  P: "Pass / Fail";
  S: "Standard Letter Grade";
}
export type GradingMode = Open<keyof GradingModeDescriptions>;
