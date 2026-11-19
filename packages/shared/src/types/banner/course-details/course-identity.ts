/**
 * The four hidden `<span class="notvisible">` elements at the end of a tab,
 * which Banner's page reads to title the dialog ("CIS 2168 Data
 * Structures"). Catalog always ends with them (178 of 178); the other tabs,
 * Syllabus included, only when the form has a non-empty `first`. Each field is named after its span's `id`.
 */
export interface CourseIdentity {
  /** `#subjectCode` ("CIS"). */
  subjectCode: string;
  /** `#courseNumber`, as requested ("2168", "M494"). */
  courseNumber: string;
  /** `#courseTitle`, the same text as the Catalog tab's "Title:". */
  courseTitle: string;
  /** `#courseDisplay`; equal to `courseNumber` in every capture. */
  courseDisplay: string;
}
