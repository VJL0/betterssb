/**
 * The "Fees" tab, `POST /ssb/searchResults/getFees`.
 */

import type { SectionFeeDescription } from "./codes";

/**
 * One row of the Fees fragment (105 to 1,199 bytes), a `<section
 * aria-labelledby="fees">` holding a `<table class="basePreqTable">` with
 * the header cells Level, Description and Amount, in that order. With no
 * fees the section holds only the text "No fee information available."
 * instead (134 of 156), so the tab's data is `SectionFee[]`, empty then.
 *
 * A section had rows exactly when its `searchResults` row had a
 * `feeAmount` (22 of 150), and `feeAmount` is the largest row, not the
 * sum: three Fall 2026 online MBA sections repeat one "Online MBA Tuition"
 * row of $3,750.00 four times behind a `feeAmount` of "$3,750.00", and a
 * pharmacy section lists "Tuition" rows of $3,816.00, $4,743.00 and
 * $4,743.00 behind "$4,743.00 or less". The other 18 had one "Course Fee"
 * row.
 */
export interface SectionFee {
  /** "Level" column; an empty `<td>` in all 33 rows seen. */
  level: "";
  /** "Description" column. */
  description: SectionFeeDescription;
  /**
   * "Amount" column, a `<td class="courseFeeAmount">` of formatted dollars
   * ("$65.00", "$3,750.00").
   */
  amount: string;
}
