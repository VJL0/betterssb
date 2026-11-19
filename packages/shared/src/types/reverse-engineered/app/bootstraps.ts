/**
 * `window.bootstraps`, the page-specific settings an inline script of the
 * term-selection, class-search and course-search pages sets (the landing page
 * and error pages have none, which is how Banner's scripts tell the landing
 * page apart). Written as a JavaScript object literal with unquoted keys.
 * Seen on 2026-11-18 on every guest capture of those pages (term 202703).
 *
 * Banner's scripts later add keys of their own to the same object at runtime
 * (`sectionSearchResultsConfigs` and `ztcEncodedImage` from the first
 * `searchResults` page); those are not in the HTML.
 */

/** `/ssb/term/termSelection?mode=search` and `?mode=courseSearch`. */
export interface TermSelectionBootstraps {
  /** False: Temple's term picker has no start/end date fields. */
  usingDates: false;
}

/** `/ssb/classSearch/classSearch`, after `term/search` with `mode=search`. */
export interface ClassSearchBootstraps {
  enrollmentDisplaySettings: EnrollmentDisplaySettings;
  datesUsed: false;
  /** The `pathMode` the page's searches run in. */
  mode: "search";
}

/** `/ssb/courseSearch/courseSearch`, after `term/search` with `mode=courseSearch`. */
export interface CourseSearchBootstraps {
  enrollmentDisplaySettings: EnrollmentDisplaySettings;
  mode: "courseSearch";
}

/**
 * Which seat counts the section details show, as "Y"/"N" flags. Temple shows
 * enrollment and waitlist counts but not the cross-list group's.
 */
export interface EnrollmentDisplaySettings {
  enrollmentDisplay: "Y";
  waitlistDisplay: "Y";
  crossListDisplay: "N";
}
