/**
 * `POST /ssb/searchResults/getCorequisites`, the "Corequisites" tab: an HTML
 * fragment, `<section aria-labelledby="coReqs">` under an
 * `<h3>Corequisites</h3>`. The response is a `string`; `CourseCorequisite[]`
 * (the catalog tab's row, from course-details) is the data it carries, one
 * per row of its `<table class="basePreqTable">` (columns Subject, Course
 * Number, Title) in Banner's order. Saved fragments are in
 * reverse-engineering/section-relations/getCorequisites/.
 *
 * Corequisites are rare: 1 of the 150 sections sampled for variety had any.
 * Asking 92 sections of likely courses (labs, practica, clinicals; saved in
 * coreq-hunt/) found 6 more, which were added to the sample with one other
 * known case, so 8 of the 157 captured have rows (one or two). Every other
 * fragment says "No corequisite course information available." and carries
 * an empty list.
 */

export type { CourseCorequisite } from "../course-details/corequisites";
