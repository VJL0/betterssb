/**
 * The Fees tab, `POST /ssb/courseSearchResults/getFees`.
 */

import type { CourseIdentity } from "./course-identity";

/**
 * Data carried by the Fees fragment, a `<table class="basePreqTable">` with
 * the columns Description, Level and Amount, or the text "No fee information
 * available." An unknown course, or a term before its first catalog version,
 * gets 500 and `CourseCatalogErrorPage` instead.
 *
 * These are the course's catalog fees. The section dialog's
 * `searchResults/getFees` orders the columns Level, Description, Amount and
 * shows the section's fees, which can differ: UBTH 5022's catalog fee is
 * $6,480.00, its section's $4,320.00.
 */
export interface CourseFees {
  /**
   * Table rows in Banner's order. Empty for "No fee information available."
   * (152 of 178); one row for 22, four for the 4 online MBA courses.
   */
  fees: CourseFee[];
  courseIdentity?: CourseIdentity;
}

/** One row of the fees table. */
export interface CourseFee {
  /**
   * "Description" column: "Course Fee" (21 of 38 rows), "Online MBA Tuition"
   * (16) or "Medical MAUB Program Fee" (1).
   */
  description: string;
  /**
   * "Level" column: a level's description for a fee charged only to that
   * level, else empty (22 of 38 rows). Only the online MBA courses set it,
   * repeating their $3,750.00 row for "Medicine", "Pharmacy", "Dentistry"
   * and "Podiatric Medicine", a level the Catalog tab never lists.
   */
  level: string;
  /** "Amount" column, formatted dollars ("$70.00", "$3,750.00"). */
  amount: string;
}
