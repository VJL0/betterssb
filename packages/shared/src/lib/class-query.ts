/**
 * Reads what a student types in the search box. Banner's public search filters
 * by subject, subject + course number, or keyword; it can't look up a CRN.
 */
export type ClassQuery =
  | { kind: "course"; subject: string; courseNumber: string }
  | { kind: "subject"; subject: string }
  | { kind: "keyword"; keyword: string }
  | { kind: "crn"; crn: string }
  | { kind: "empty" };

const COURSE = /^([A-Za-z]{2,5})\s*-?\s*(\d{4}[A-Za-z]?)$/;
const SUBJECT_ONLY = /^[A-Za-z]{2,5}$/;
const CRN = /^\d{5}$/;
const MIN_KEYWORD_LENGTH = 2;

/**
 * `subjects` are the term's subject codes; a lone word is a subject only if
 * it's one of them ("CIS"), otherwise a keyword ("data").
 */
export function parseClassQuery(
  input: string,
  subjects: ReadonlySet<string>,
): ClassQuery {
  const text = input.trim().replace(/\s+/g, " ");
  if (text.length < MIN_KEYWORD_LENGTH) return { kind: "empty" };

  const course = COURSE.exec(text);
  if (course && subjects.has(course[1]!.toUpperCase())) {
    return {
      kind: "course",
      subject: course[1]!.toUpperCase(),
      courseNumber: course[2]!.toUpperCase(),
    };
  }
  if (SUBJECT_ONLY.test(text) && subjects.has(text.toUpperCase())) {
    return { kind: "subject", subject: text.toUpperCase() };
  }
  if (CRN.test(text)) return { kind: "crn", crn: text };
  return { kind: "keyword", keyword: text };
}
