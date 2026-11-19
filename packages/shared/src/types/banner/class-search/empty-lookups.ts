/**
 * `GET /ssb/classSearch/get_department`, `get_level` and `get_scheduleType`,
 * which answer a guest but have no picker on Temple's class search page. All
 * three returned an empty list (`"\n[\n]"`, 200, `application/json`) every
 * time: for each of 2026 Summer I, 2026 Fall and 2027 Spring with Banner's
 * parameters, and in 2027 Spring without `term` or with `searchTerm` "%" and
 * `max` "0" (15 of 15 calls on 2026-11-18, plus 5 by discovery), so their
 * query (`LookupQuery`) changes nothing. `get_division` and made-up names are
 * 404 pages instead.
 */

/** Always `[]`. */
export type GetDepartmentResponse = [];

/** Always `[]`. */
export type GetLevelResponse = [];

/** Always `[]`. */
export type GetScheduleTypeResponse = [];
