/**
 * `GET /ssb/courseSearch/get_*`, the lookups behind the catalog's select2
 * pickers: `get_subject`, `get_college`, `get_division` and `get_attribute`
 * (the `data-endpoint` of `#txt_subject`, `#txt_college`, `#txt_division`
 * and `#txt_attribute`), plus `get_department`, `get_level` and
 * `get_scheduleType`, which answer but have no picker. Captured on
 * 2026-11-18 for 2026 Summer I, 2026 Fall and 2027 Spring, plus 63 probe
 * calls.
 *
 * They work like the class search's lookups and take the same query: Banner's
 * page sends `searchTerm`, `term`, `offset`, `max` "10", `uniqueSessionId`
 * and `_` (`LookupQuery`; `PagedLookupQuery` for `get_subject`, the only
 * picker with class `page`). Same JSON format, no session needed (a fresh
 * cookie jar got the usual rows), and a POST with the same fields answered
 * the same. `get_subject` without `offset` or `max`, or with `offset` "0",
 * is a 500 page (`LookupErrorPage`); `max` "0" or "1000" lists everything.
 *
 * Where the class search has the same route the answer is the same, so
 * these use its types:
 *
 * - `get_college`: `GetCollegeResponse`, the same 17 rows as
 *   `classSearch/get_college` for every term, and for no term or "999999".
 * - `get_attribute`: `GetAttributeResponse`, likewise 32 rows.
 * - `get_department`, `get_level`, `get_scheduleType`: `[]` every time
 *   (`GetDepartmentResponse`, `GetLevelResponse`, `GetScheduleTypeResponse`):
 *   for each term, and in 2027 Spring with `searchTerm` "%" and `max` "500"
 *   or without `term` (13 calls, plus 3 by discovery).
 */

import type { CodeDescription } from "../common";
import type { SubjectOption } from "../class-search/subject";
import type { LookupDivision } from "./codes";

/**
 * `get_subject`: exactly the subjects of the term's catalog, with the same
 * descriptions as the course rows' `subjectDescription`. 251 in Summer I,
 * 253 in Fall and Spring (Fall and Spring add ALC and CLIV), against 134 and
 * 183 from `classSearch/get_subject`, all of which are here with the same
 * description. Sorted by the unescaped description ignoring case ("Media
 * and Communication" before "Media Studies &amp; Production"), where the
 * class search sorts in code-point order. "999999" gave 254
 * (Spring's plus NUAN); a missing or empty `term` gives `[]`.
 */
export type CourseSearchGetSubjectResponse = SubjectOption[];

/**
 * `get_division`, which the class search doesn't have (a 404 there): GR
 * "Graduate" and UG "Undergraduate" whatever the term, `offset` or `max`.
 * `searchTerm` matches descriptions as a substring, so "GR" lists both.
 */
export type CourseSearchGetDivisionResponse = CodeDescription<LookupDivision>[];
