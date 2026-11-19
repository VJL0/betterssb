/**
 * `GET /ssb/classSearch/get_instructor`, the Instructor picker; its codes go
 * in `txt_instructor` of `searchResults`, but only within the session that
 * looked them up. Same JSON format as `get_subject`.
 */

import type { CodeDescription } from "../common";
import type { PagedLookupQuery } from "./request";

export interface InstructorQuery extends PagedLookupQuery {
  /**
   * Matched against the stored first, middle and last name one at a time,
   * never the whole name ("Cinzia" and "Abbate" each find her, "Cinzia
   * Abbate" and "Abbate, Cinzia" nothing), nor the credentials or the code
   * ("OTD", "20065" find nothing). Case-insensitive, wrapped in `%` unless it
   * holds one ("Cin%" finds Cinzia Abbate and Mark Cinquegrani), with `_` as
   * any one character, like the other lookups. The stored names have no
   * accents, apostrophes or hyphens: "Leger" finds Natalie M. Léger and
   * "OBanion" Phillip R. O'Banion, but "Léger", "O'Banion" and
   * "Abbott-Gaffney" find nobody ("Abbott" and "Gaffney" do). The first name
   * is the legal one, not the one displayed: "Cynthia" also finds two
   * instructors shown as "Cindy", and "Rose" finds "Erin R. Boyle".
   */
  searchTerm?: string;
}

/**
 * The instructors of `term`: 1,047 in 2026 Summer I, 3,744 in Fall and 3,411
 * in Spring, more than appear as faculty in the term's search results (881,
 * 3,248 and 2,971 names). With two terms ("202620,202703") it lists both
 * terms' instructors once each (3,602). Ordered by last name as Banner
 * stores it (Abbate, Abbe, Abbott-Gaffney…), which the displayed name doesn't
 * always show: by their displayed last word, 50, 148 and 139 rows are out of
 * place ("Ama Mazama" sits among the Ch…).
 */
export type GetInstructorResponse = InstructorOption[];

export interface InstructorOption extends CodeDescription {
  /**
   * Five digits ("32402"), not a Banner ID: a number the session hands out
   * the first time it lists an instructor, counting up in the order rows come
   * back (each full download ran consecutively in list order, but for one
   * gap of 4 in 2026 Fall). The search results of the same session use the
   * same numbers as `Faculty.bannerId`, numbering faculty not looked up yet
   * the same way. Repeating a lookup keeps the codes; another session gets
   * others (Cinzia Abbate was 23981, 25975, 28337, 32402 and 40011 in
   * five sessions of 2027 Spring).
   *
   * A code is good for `txt_instructor` only in the session (`JSESSIONID`)
   * that handed it out. Another session's code, or one never handed out
   * ("1"), makes `searchResults` a 500 that ends the session, even when the
   * other session used the same `uniqueSessionId`. After any 500 the codes
   * are gone: the same instructor gets a new one.
   */
  code: string;
  /**
   * The name as displayed, with any credentials ("Cynthia Abbott-Gaffney,
   * OTD, MA, OTR/L, FAOTA": 4, 14 and 14 rows have a comma). Not
   * HTML-escaped, though the other lookups' descriptions and
   * `Faculty.displayName` ("Scott A. O&#39;Donnell") are: apostrophes and
   * accents arrive as is ("Phillip R. O'Banion", "Noelia Rivera-Calderón").
   * Sometimes ends with a space ("HUGO AYALA ", 0, 13 and 10 rows), has two
   * spaces in a row ("Forster  Asare", 6, 21 and 13) or a no-break space (1
   * in Fall). Not unique: 4 names in Fall and 4 in Spring appear twice, with
   * different codes.
   */
  description: string;
}
