/**
 * Code lists seen across every section of 2026 Summer I, 2026 Fall and 2027
 * Spring, each left `Open`. Descriptions are spelled exactly as Banner sends
 * them, HTML escapes included.
 */

import type { Open } from "../common";

export type KnownPartOfTerm =
  | "1"
  | "04A"
  | "07A"
  | "07B"
  | "12A"
  | "DGR"
  | "DPA"
  | "DPB"
  | "ETS"
  | "FGD"
  | "FGE"
  | "FGG"
  | "GSR"
  | "ITP"
  | "LAW"
  | "LDC"
  | "MP1"
  | "MP2"
  | "MP3"
  | "MP4"
  | "MPA"
  | "MPN"
  | "PHA"
  | "PHC"
  | "PHR"
  | "PP4"
  | "RRC"
  | "S01"
  | "SDC"
  | "TJE"
  | "TJI"
  | "TLT"
  | "TMB"
  | "TSL"
  | "TUJ"
  | "XSP";
export type PartOfTerm = Open<KnownPartOfTerm>;

/** The section's home campus; meetings carry their own, coded campus. */
export type KnownSectionCampusDescription =
  | "Ambler"
  | "Beijing"
  | "Center City"
  | "Church Teacher&#39;s College"
  | "Health Sciences"
  | "Japan"
  | "Japan Kyoto"
  | "Japan Tokyo Hillside Center"
  | "Lancaster General Hospital"
  | "Main"
  | "Main Line Health"
  | "Non Temple Study Away Location"
  | "Non Temple University Exchange"
  | "Off Campus Sites"
  | "Other Hospital/Medical Center"
  | "Out Of The Area"
  | "Philadelphia School District"
  | "QA/RA Pharmacy - Other"
  | "Rome"
  | "St. Joseph&#39;s Univ AF ROTC"
  | "St. Luke&#39;s Hospital"
  | "Temple University Hospital"
  | "Univ Pennsylvania Naval ROTC";
export type SectionCampusDescription = Open<KnownSectionCampusDescription>;

export interface MeetingCampusDescriptions {
  AMB: "Ambler";
  ARR: "Arranged";
  CC: "Center City";
  HSC: "Health Sciences";
  JPH: "Japan Tokyo Hillside Center";
  JPK: "Japan Kyoto";
  JPN: "Japan";
  MN: "Main";
  ONL: "Online Learning";
}
export type MeetingCampus = Open<keyof MeetingCampusDescriptions>;

/** `meetingScheduleType` on a meeting, `scheduleTypeDescription` on its section. */
export interface ScheduleTypeDescriptions {
  BAS: "Base Lecture";
  BLT: "Base Lecture with Tutorial";
  CO: "Co-op";
  DIS: "Dissertation Course";
  DSC: "Dental School Clinic";
  FLD: "Field Study";
  FSS: "Field Study and Seminar";
  FYW: "First Year Writing";
  INT: "Internship";
  IS: "Independent Study";
  LAB: "Lab";
  LCL: "Law Clinical";
  LF: "Lecture and Field Trip";
  LGR: "Law Guided Research &amp; Writing";
  LL: "Lecture and Lab";
  LLR: "Lecture, Lab and Recitation";
  LP: "Lecture and Practicum";
  LR: "Lecture and Recitation";
  LRW: "Legal Research &amp; Writing";
  LS: "Lecture and Studio";
  LSK: "Legal Skill";
  LWS: "Law - Writing Seminar";
  MAS: "Masters Thesis Course";
  MBS: "Medical Basic Science";
  MCE: "Medical Clinical Elective";
  MCF: "Medical Clinical Foundation";
  MNE: "Medical Non-Clinical Elective";
  MR3: "Medical Required Third Year";
  MR4: "Medical Required Fourth Year";
  PAR: "Pharmacy Advanced Rotation";
  PI: "Private Instruction";
  PIR: "Pharmacy Introductory Rotation";
  PRA: "Practicum";
  PRF: "Exhibition/Performance";
  REC: "Recitation";
  RES: "Research";
  SEM: "Seminar";
  SPL: "Studio Production Lab";
  ST: "Studio";
}
export type ScheduleType = Open<keyof ScheduleTypeDescriptions>;
export type ScheduleTypeDescription = Open<
  ScheduleTypeDescriptions[keyof ScheduleTypeDescriptions]
>;

export interface MeetingTypeDescriptions {
  AMFT: "Ambler Campus Field Trip";
  CLAS: "Class";
  FDTP: "Field Trip";
  HYBR: "Mix of in-person and online";
  LAB: "Laboratory";
  LEC: "Lecture";
  NCLS: "Non class meeting";
  NSFF: "No SFF";
  OLL: "Online course activity";
  ONSA: "On site activity";
  PERF: "Performance";
  PRA: "Practicum";
  REC: "Recitation";
  SEM: "Seminar";
  STDO: "Studio";
  VIRT: "Virtual Meeting";
}
export type MeetingType = Open<keyof MeetingTypeDescriptions>;

/** Section-level delivery mode; not the same code list as `MeetingType`. */
export interface InstructionalMethodDescriptions {
  CAPEX: "Classroom &amp; Applied Experience";
  CBL: "Community Based Learning";
  CLAS: "Classroom In-Person";
  HYB2: "Online with on-site activities";
  HYBR: "Mix of In-person and Online";
  LAB: "Laboratory";
  LCOMM: "Learning Community";
  NCLAS: "Non-Classroom (Field &amp; I.S.)";
  OLL: "Online - no scheduled meetings";
  REC: "Recitation";
  STDO: "Studio";
  SUPV: "Supervised Experience";
  VIRT: "Online w/ req virtual meetings";
  VRT2: "Online with Mixed Modalities";
}
export type InstructionalMethod = Open<keyof InstructionalMethodDescriptions>;

export interface SectionAttributeDescriptions {
  AC: "_Core American Culture";
  ANON: "Anonymous Grading";
  AR: "_Core Arts";
  CEC: "Community Engaged Course";
  DI: "Dissertation FT. Status";
  GA: "GenEd Arts";
  GB: "GenEd Human Behavior";
  GD: "GenEd Race &amp; Diversity";
  GG: "GenEd Global/World Society";
  GQ: "GenEd Quantitative Literacy";
  GS: "GenEd Science &amp; Technology";
  GU: "GenEd US Society";
  GW: "GenEd Analyt Reading/Writing";
  GY: "GenEd Intellectual Heritage I";
  GZ: "GenEd Intellectual Heritage II";
  HO: "Honors";
  IN: "_Core Individual and Society";
  IS: "_Core International Studies";
  LA: "Language A";
  LB: "Language B";
  LC: "Language C";
  M1: "MEDICAL SCHOOL";
  M2: "MEDICAL SCHOOL";
  M5: "MEDICAL SCHOOL";
  QA: "_Core Quantitative Reasoning A";
  QB: "_Core Quantitative Reasoning B";
  RN: "_Core Race/Individual Society";
  RS: "_Core Race";
  SA: "_Core Science &amp; Technology A";
  SB: "_Core Science &amp; Technology B";
  SE: "Sustainable Environment";
  SF: "Sustainability Focused";
  SI: "Sustainability Inclusive";
  SP: "Sustainable Econ &amp; Politics";
  SS: "Sustainable Social &amp; Culture";
  WI: "Writing Intensive";
}
export type SectionAttributeCode = Open<keyof SectionAttributeDescriptions>;

/**
 * Sets how `creditHourLow` and `creditHourHigh` combine: "TO" is a range the
 * student picks from, "OR" is one or the other.
 */
export type CreditHourIndicator = "TO" | "OR";

/** Mostly "01"; several meetings of one section often share a value. */
export type MeetingCategory = Open<
  "01" | "02" | "03" | "04" | "05" | "10" | "20"
>;
