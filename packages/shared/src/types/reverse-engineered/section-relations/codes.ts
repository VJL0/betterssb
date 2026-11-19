/**
 * Code lists seen on the `section` of `getFacultyMeetingTimes?first=first`
 * for the 157 sampled sections, each left `Open`.
 */

import type { Open } from "../common";

/**
 * `campus` with its `campusDescription`, HTML-escaped like the class
 * search's `SectionCampusDescription`. The meeting-level `MeetingCampus`
 * list has no ROM, SLK, TUH, XPD or NTS: the 14 sections on those campuses
 * had only meetings with a null campus, or no meetings.
 */
export interface SectionCampusDescriptions {
  AMB: "Ambler";
  CC: "Center City";
  HSC: "Health Sciences";
  JPH: "Japan Tokyo Hillside Center";
  JPK: "Japan Kyoto";
  JPN: "Japan";
  MN: "Main";
  NTS: "Non Temple Study Away Location";
  ROM: "Rome";
  SLK: "St. Luke&#39;s Hospital";
  TUH: "Temple University Hospital";
  XPD: "Philadelphia School District";
}
export type SectionCampus = Open<keyof SectionCampusDescriptions>;

/** Presumably day, evening and weekend; not explained anywhere on the page. */
export type SectionSession = Open<"D" | "E" | "W">;

/**
 * "A" on 76 of 157, "L" on 59, "O" on 22. Unrelated to `openSection`: each
 * value was seen with both true and false.
 */
export type SectionStatus = Open<"A" | "L" | "O">;

/**
 * How Banner checks the section's prerequisites: "C" (CAPP, 59 of 157) on
 * exactly the sections whose Prerequisites tab prints Temple's CAPP rules,
 * "B" (basic, 98) on exactly those whose tab says "No prerequisite
 * information available.".
 */
export type PrerequisiteCheckMethod = Open<"B" | "C">;
