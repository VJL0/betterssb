/**
 * Code lists seen on the Catalog and Class Details tabs of the 156 sections
 * sampled, each left `Open`. Unlike `search-results/codes.ts`, descriptions
 * are decoded text, the way a DOM parser reads the fragments: the markup
 * spells "Science &amp; Technology", the text is "Science & Technology".
 */

import type { Open } from "../common";

/**
 * "College:" line of the Catalog tab. The same codes and descriptions as
 * `classSearch/get_college`, plus "PV", which that lookup leaves out.
 */
export interface CollegeDescriptions {
  BC: "Music & Dance, Boyer College";
  BU: "Business & Mngmnt, Fox School";
  CA: "Theater, Film & Media Arts";
  CO: "Media & Comm, Klein College";
  DN: "Dentistry, Kornberg School";
  ED: "Education & Human Development";
  EN: "Engineering";
  HP: "College of Public Health";
  LA: "Liberal Arts";
  LW: "Law, Beasley School";
  ME: "Medicine, Lewis Katz School";
  PH: "Pharmacy";
  PV: "Provost";
  ST: "Science & Technology";
  SW: "Social Work";
  TA: "Art Architecture, Tyler School";
  TH: "Sport Tourism Hospitality Mgt";
  UC: "University College";
}
export type College = Open<keyof CollegeDescriptions>;

/**
 * "Division:" line of the Catalog tab. `courseSearch/get_division` offers
 * only "GR" and "UG"; the professional schools have their own.
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

/** "Levels:" lines of the Catalog tab. */
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

/**
 * "Grading Modes:" lines of the Catalog tab. The Class Details tab prints
 * the description alone, without the code.
 */
export interface GradingModeDescriptions {
  C: "Credit/No Credit";
  I: "Law - International";
  K: "GR Level P/F/R In-Progress";
  N: "GR Level Credits in Progress";
  P: "Pass / Fail";
  S: "Standard Letter Grade";
}
export type GradingMode = Open<keyof GradingModeDescriptions>;

/**
 * "Grade Mode:" line of the Class Details tab: the section's own grade mode
 * by description, or a fixed sentence when the section sets none (121 of
 * 156), whether the catalog offers one grading mode or several.
 */
export type ClassDetailsGradeMode = Open<
  | GradingModeDescriptions[keyof GradingModeDescriptions]
  | "No Section specified grade mode, please see Catalog link below for more information."
>;

/** "Description" column of the Fees tab. */
export type SectionFeeDescription = Open<
  "Course Fee" | "Online MBA Tuition" | "Tuition"
>;
