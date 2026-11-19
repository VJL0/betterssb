/**
 * `GET /ssb/term/saveTerm?mode=<mode>`, which Banner's term page calls when a
 * term or a date range is chosen, before Continue (`term/search`). It reads
 * the `txt_term` input's `data-save-endpoint`, so `mode` is the page's own.
 * Banner's JS calls it only when someone is signed in or the page has a
 * study-path or alternate-PIN input, so guest pages never do; called anyway,
 * it answers a guest without cookies or session.
 *
 * Nothing it does was visible afterwards: it doesn't pick a term (searches
 * still return `data: null`), doesn't replace one picked by `term/search`,
 * and doesn't prefill the term page. POST answers the same.
 */

import type { BannerDate } from "../search-results/index";
import type { TermMode } from "./codes";

/**
 * Banner's page sends `term` + `uniqueSessionId`, or the two dates +
 * `uniqueSessionId`. The answer never depended on `mode` (all five, "bogus"
 * and none gave the same) or on the session.
 */
export interface SaveTermQuery {
  mode?: TermMode;
  /** Echoed back as `maxterm`, whatever it is. */
  term?: string;
  /**
   * "MM/DD/YYYY", both or neither. Other formats are a 500 with the parser's
   * message ("Unparseable date: &quot;2027-01-15&quot;", or just "1/5/2027").
   * When both are set they win over `term`.
   */
  startDatepicker?: BannerDate;
  endDatepicker?: BannerDate;
  uniqueSessionId?: string;
  /**
   * Sent "" in a probe; changed nothing. Banner's JS sends `student` (with
   * `term` and `uniqueSessionId`) to the advisor picker's own
   * `#txt_advisee[data-save-endpoint]`, which no page seen here has.
   */
  student?: string;
}

export interface SaveTermResponse {
  /**
   * With `term`, that `term` verbatim ("202636", "abc", "" for an empty one).
   * With both dates, the highest term code whose date range overlaps them,
   * or null when none does (01/01/1990–01/31/1990). Null with neither, or
   * with only one date.
   *
   * Banner's term ranges run well past the classes. Single days answered, on
   * 2026-11-18: through 10/12/2025 "202536" (from 08/01/2025, where the scan
   * started), 10/13/2025–04/09/2026 "202603", 04/10–04/12/2026 "202620",
   * 04/13–10/09/2026 "202636", 10/10/2026–08/06/2027 "202703", then null,
   * also for 2028 in courseSearch mode. 2026 Summer II never wins a day.
   * A reversed range still answers (05/10/2027–01/15/2027 gave "202703").
   */
  maxterm: string | null;
  /**
   * Only signed in (`false` in every answer of the user's HARs); absent for
   * a guest. Banner's page shows the alternate-PIN input when true. Its JS
   * also reads `studyPath`, `studentReset` and `restrictActionForPersona`,
   * none of which were ever sent.
   */
  enterPin?: false;
}
