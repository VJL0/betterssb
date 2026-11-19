/**
 * Code lists of the class search pickers, as the `get_*` lookups listed them
 * for 2026 Summer I, 2026 Fall and 2027 Spring on 2026-11-18, each left
 * `Open`. Descriptions are spelled exactly as Banner sends them, HTML escapes
 * included. Where a list overlaps a `search-results` one it reuses that list
 * minus the codes the picker never offered, because the picker and the
 * sections don't list the same codes.
 */

import type { Open } from "../common";
import type {
  InstructionalMethodDescriptions,
  MeetingCampusDescriptions,
  SectionAttributeDescriptions,
} from "../search-results/codes";

/**
 * `get_campus`, the same 38 campuses for every term. They are section
 * campuses: `txt_campus` "AMB" found the 71 sections of 2027 Spring whose
 * `campusDescription` is "Ambler" (36 have an AMB meeting) and "CC" the 51
 * "Center City" ones (28 have a CC meeting). Meetings use the same codes, all
 * listed here but for "ARR" (Arranged). The picker leaves out 10 section
 * campuses that the captured sections used ("Temple University Hospital",
 * "Philadelphia School District"…), so those can't be picked.
 */
export interface LookupCampusDescriptions extends Omit<
  MeetingCampusDescriptions,
  "ARR"
> {
  FTW: "Fort Washington";
  HAR: "Harrisburg";
  OFF: "Off Campus Sites";
  ROM: "Rome";
  XCJ: "Central High School";
  XDC: "Delaware County Community Coll";
  XDE: "Desmond Conference Center";
  XLC: "Bucks CC at Log College";
  XLE: "Lehigh Carbon Comm College";
  XMC: "Montgomery Co Community Col";
  XNB: "Northeast High School";
  XNC: "Northampton Community Coll";
  XNS: "Neshaminey School District";
  XPN: "Univ Pennsylvania Naval ROTC";
  XQ5: "QA/RA Pharmacy - California";
  XQ6: "QA/RA Sanofi-Pasteur";
  /** The only en dash, escaped. */
  XQ7: "QA/RA Pharmacy &ndash; Frazer, PA";
  XQB: "QA/RA Pharmacy - Massachusetts";
  XQC: "QA/RA Pharmacy - Connecticut";
  XQD: "QA/RA AstraZeneca, Delaware";
  XQM: "QA/RA Pharmacy - Michigan";
  XQO: "QA/RA Pharmacy - Ohio";
  XQQ: "QA/RA - Amgen";
  XQS: "QA/RA Pharmacy - Missouri";
  XQV: "QA/RA Pharmacy - Virginia";
  XQY: "QA/RA Pharmacy - New York";
  XQZ: "QA/RA Pharmacy - Other";
  XRI: "Ridley School District";
  XSJ: "St. Joseph&#39;s Univ AF ROTC";
  XZZ: "Out Of The Area";
}
export type LookupCampus = Open<keyof LookupCampusDescriptions>;

/**
 * `get_college`, the same 17 for every term. Sections don't carry their
 * college, so `txt_college` is the only way to filter by it.
 */
export interface LookupCollegeDescriptions {
  BC: "Music &amp; Dance, Boyer College";
  BU: "Business &amp; Mngmnt, Fox School";
  CA: "Theater, Film &amp; Media Arts";
  CO: "Media &amp; Comm, Klein College";
  DN: "Dentistry, Kornberg School";
  ED: "Education &amp; Human Development";
  EN: "Engineering";
  HP: "College of Public Health";
  LA: "Liberal Arts";
  LW: "Law, Beasley School";
  ME: "Medicine, Lewis Katz School";
  PH: "Pharmacy";
  SW: "Social Work";
  ST: "Science &amp; Technology";
  TA: "Art Architecture, Tyler School";
  TH: "Sport Tourism Hospitality Mgt";
  UC: "University College";
}
export type LookupCollege = Open<keyof LookupCollegeDescriptions>;

/**
 * `get_attribute`, the same 32 for every term. Sections also carry ANON, CEC,
 * DI, M1, M2 and M5, which the picker doesn't offer; XC and ZTC are offered
 * but no captured section had them (zero-textbook-cost sections show it as
 * `isZTCAttribute` instead).
 */
export interface LookupAttributeDescriptions extends Omit<
  SectionAttributeDescriptions,
  "ANON" | "CEC" | "DI" | "M1" | "M2" | "M5"
> {
  XC: "_Core Am Cult/St Race/Writing";
  ZTC: "Zero Textbook Cost";
}
export type LookupAttribute = Open<keyof LookupAttributeDescriptions>;

/**
 * `get_instructionalMethod`, the same 11 for every term. Sections also use
 * CAPEX, LCOMM, REC and SUPV, which the picker doesn't offer.
 */
export interface LookupInstructionalMethodDescriptions extends Omit<
  InstructionalMethodDescriptions,
  "CAPEX" | "LCOMM" | "REC" | "SUPV"
> {
  /** Offered, but no captured section used it. */
  VIDEO: "Video conference";
}
export type LookupInstructionalMethod = Open<
  keyof LookupInstructionalMethodDescriptions
>;

/**
 * `get_session`, the same 3 for every term. Sections don't carry a session
 * code, so `txt_session` is the only way to filter by it.
 */
export interface LookupSessionDescriptions {
  D: "Day";
  E: "Evening";
  W: "Weekend";
}
export type LookupSession = Open<keyof LookupSessionDescriptions>;

/**
 * Every code `get_partOfTerm` listed in the three terms (11, 12 and 12 of
 * them). The picker offers only these, while the captured sections used 21,
 * 28 and 29 parts of term ("LAW", "MP1"…; see `KnownPartOfTerm`). 04B, FGC
 * and FGF were offered but no captured section used them.
 */
export type KnownLookupPartOfTerm =
  | "1"
  | "04A"
  | "04B"
  | "07A"
  | "07B"
  | "12A"
  | "ETS"
  | "FGC"
  | "FGD"
  | "FGE"
  | "FGF"
  | "FGG"
  | "SDC"
  | "TJE"
  | "TUJ";
export type LookupPartOfTerm = Open<KnownLookupPartOfTerm>;
