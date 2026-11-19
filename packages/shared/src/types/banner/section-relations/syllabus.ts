/**
 * `POST /ssb/searchResults/getSyllabus`, a "Syllabus" tab that Temple's class
 * search page doesn't render (no `data-endpoint` for it) but the controller
 * still answers like the other tabs: an HTML fragment,
 * `<section aria-labelledby="syllabus">`. The response is a `string`; this
 * is what it carried on all 157 sampled sections: only its empty-state text,
 * without a final period. Saved fragments are in
 * reverse-engineering/section-relations/getSyllabus/.
 */
export interface SyllabusTab {
  message: "No Syllabus Information Available";
}
