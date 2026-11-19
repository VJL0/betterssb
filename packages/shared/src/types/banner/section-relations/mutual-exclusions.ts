/**
 * `POST /ssb/searchResults/getCourseMutuallyExclusions`, the "Mutual
 * Exclusion" tab: an HTML fragment, `<section aria-labelledby="mexc">` with
 * no heading. The response is a `string`; `CourseMutualExclusion[]` (the
 * catalog tab's row, from course-details) is the data it carries, one per
 * row of its `<table class="basePreqTable">` (columns Subject, Course Number,
 * Course Title, Level, Grade) in Banner's order. Saved fragments are in
 * reverse-engineering/section-relations/getCourseMutuallyExclusions/.
 *
 * 11 of the 157 sampled sections had rows (1 to 7), each table after the
 * `<span>` "This course carries a mutual exclusion with the following
 * courses; you may not enroll in it if you have completed any of the
 * following:" and two `<br>`. Levels seen: "Undergraduate", "Law",
 * "Pharmacy"; grades "C-", "D", "D-". The other 146 say "No Mutual Exclusion
 * information available." and carry an empty list.
 */

export type { CourseMutualExclusion } from "../course-details/mutual-exclusions";
