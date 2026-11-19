/**
 * `POST /ssb/classSearch/resetDataForm` and `POST /ssb/courseSearch/resetDataForm`,
 * the "Search Again" buttons (`#search-again-button`'s `data-endpoint`).
 *
 * A session caches the result set of its first search, an empty one too:
 * until a reset, every later `searchResults` (or `courseSearchResults`)
 * returns that same set whatever its filters say, only re-sorted and re-paged
 * by `sortColumn`, `sortDirection`, `pageOffset` and `pageMaxSize`. These
 * routes empty that cache. They never drop the term: the next search runs
 * without another `term/search`. Calling `term/search` again also empties the
 * section cache.
 *
 * Seen on 2026-11-18 in 9 guest sessions (terms 202703 and 202636), probing
 * each flag with a search on another subject before and after:
 *
 * - `classSearch/resetDataForm` empties the section cache and ignores the
 *   form, even `resetCourses=true`; the course cache stays.
 * - `courseSearch/resetDataForm` empties the course cache when `resetCourses`
 *   is non-empty and the section cache when `resetSections` is non-empty,
 *   whatever the value: "false" counts (Groovy truth), so the
 *   `resetCourses=false&resetSections=true` that Banner's class-results
 *   "Search Again" sends in course-search mode empties both. An empty form,
 *   or both flags empty, empties nothing.
 *
 * Each route works the same in either `pathMode`. `courseSearch/resetDataForm`
 * worked without `X-Requested-With` (with it, the response adds
 * `Cache-Control: no-cache,no-store` and `Expires: -1`), and a GET to
 * `classSearch/resetDataForm` did the same as the POST. Without cookies, or
 * before any term, both still answer "true" (a cookie-less call gets a new
 * `JSESSIONID`).
 */

/**
 * Urlencoded form. Banner's page sends `resetCourses=true&resetSections=true`
 * to `courseSearch/resetDataForm` from the course results, the class results
 * send `resetCourses=false&resetSections=true` there in course-search mode,
 * and `classSearch/resetDataForm` gets an empty body.
 */
export interface ResetDataFormRequest {
  /** Any non-empty value empties the course cache; `courseSearch` route only. */
  resetCourses?: string;
  /** Any non-empty value empties the section cache; `courseSearch` route only. */
  resetSections?: string;
}

/** The 4 bytes "true", as `text/html;charset=utf-8`, every time. */
export type ResetDataFormResponse = "true";
