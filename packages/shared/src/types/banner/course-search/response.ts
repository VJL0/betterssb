/**
 * `GET /ssb/courseSearchResults/courseSearchResults`, the Browse Course
 * Catalog's search (`#search-go-endpoint` on `/ssb/courseSearch/courseSearch`).
 * Always `application/json;charset=UTF-8` with status 200 while the session
 * has a term; otherwise a 500 page (`CourseSearchResultsErrorPage`).
 *
 * Seen on 2026-11-18: the 26 pages of 500 of each of 2026 Summer I, 2026
 * Fall and 2027 Spring, and 130 probe responses, all from guest sessions,
 * plus one signed-in `plan` search in the user's HARs.
 */

import type { SearchResultsConfig } from "../search-results/response";
import type { CatalogCourse } from "./course";

/**
 * The `mode` of the `term/search` that opened the session: "courseSearch"
 * for a guest on the catalog, "search" when the session was opened for the
 * class search (the catalog search still works there), "plan" signed in.
 */
export type CatalogPathMode = "courseSearch" | "search" | "plan";

/**
 * A session caches the courses of its first search (an empty set too):
 * until `courseSearch/resetDataForm` (`CatalogResetForm`) or another
 * `term/search`, every call returns that set whatever its filters and
 * `txt_term` say, only re-sorted and re-paged.
 */
export interface CourseSearchResultsResponse {
  /**
   * False only for a `sortColumn` or `sortDirection` Banner doesn't know
   * (2 of 2), with `data: []`; Banner's page then shows its internal error
   * notice.
   */
  success: boolean;
  /** Matching courses across all pages. */
  totalCount: number;
  /** Always equal to `totalCount`; Banner's page prints it as the count. */
  coursesFetchedCount: number;
  /** Echoes the request; 0 when it was left out. */
  pageOffset: number;
  /**
   * Echoes the request but capped at 500 ("1000" and "2000" came back as
   * 500, with 500 rows at most). "0" is echoed as 0 with 10 rows; left out
   * it is 20.
   */
  pageMaxSize: number;
  pathMode: CatalogPathMode;
  /**
   * Empty, not null, past the end, when nothing matches, and when the call
   * leaves out `txt_term`.
   */
  data: CatalogCourse[];
  /**
   * Only on the call that ran the search (the first after a reset), at any
   * `pageOffset`; null on calls answered from the cache. Banner's page keeps
   * the first one it sees for its table columns.
   */
  courseSearchResultsConfigs: CourseSearchResultsConfig[] | null;
  displaySettings: CatalogDisplaySettings;
  /** False for guests; true on the one signed-in `plan` search. */
  isPlanByCrnSetForTerm: boolean;
}

/**
 * A results-table column. Always the same four, in this order: courseTitle
 * ("Title", required, "9%"), subject ("Subject", "5%"), courseNumber
 * ("Course Number", "5%") and creditHours ("Hours", "3%"); `title` repeats
 * `display`.
 */
export interface CourseSearchResultsConfig extends SearchResultsConfig {
  config: "courseTitle" | "subject" | "courseNumber" | "creditHours";
}

/** The same on every response, the signed-in one included. */
export interface CatalogDisplaySettings {
  enrollmentDisplay: "Y";
  waitlistDisplay: "Y";
  crossListDisplay: "N";
}
