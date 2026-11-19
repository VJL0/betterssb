/**
 * `POST /ssb/searchResults/getSectionPrerequisites`, the "Prerequisites" tab:
 * an HTML fragment, `<section aria-labelledby="preReqs">` under an
 * `<h3>Catalog Prerequisites</h3>`. The response is a `string`;
 * `CatalogPrerequisites` is the data it carries. Saved fragments are in
 * reverse-engineering/section-relations/getSectionPrerequisites/.
 *
 * Without prerequisites the fragment says "No prerequisite information
 * available." and carries nothing (98 of 157 sampled sections). Otherwise it holds Temple's
 * CAPP-style rules: a `<table class="cappPreqTable">` with one
 * `<th>Area Prerequisites</th>` and one cell, `<td><strong>`, of `<pre>`
 * blocks: an area header, one block per rule, and a last `<pre>)</pre>`.
 * Banner's basic prerequisite table (And/Or, Test, Score, Subject…) never
 * appeared.
 */

/**
 * The rules read top to bottom as Banner prints them, with no precedence:
 * "(A or B) and (C or D)" arrives as "(", A, ") or (", B, ") and (", C,
 * ") or (", D, ")", so a parser rebuilds the groups from `connector`.
 */
export interface CatalogPrerequisites {
  /**
   * The first `<pre>` after "Prerequisites:", untrimmed: "PR: " plus a short
   * course title, then a newline, sometimes after trailing spaces
   * ("PR: Financial Management    \n").
   */
  area: string;
  rules: PrerequisiteRule[];
}

export type PrerequisiteRule =
  PrerequisiteCourse | PrerequisiteAttribute | PrerequisiteTest;

/**
 * Text Banner prints above a course or attribute rule in its `<pre>`, line
 * breaks as spaces: "(" opens the first group (the first rule always has it),
 * ") or (" and ") and (" close a group and open the next, and "and" adds a
 * rule to the open group without parentheses. All four appear in Fall 2026
 * CRN 57251 (EPBI 9289).
 */
export type PrerequisiteConnector = "(" | ") or (" | ") and (" | "and";

/** A " Course or Test: Economics 1101 " rule. */
export interface PrerequisiteCourse {
  connector: PrerequisiteConnector;
  /**
   * The subject's description, not its code, HTML-escaped ("Computer &amp;
   * Information Science").
   */
  subjectDescription: string;
  /** "1101", or the low end of a range ("Mathematics 0800 to 4999"). */
  courseNumber: string;
  /** The high end of a range; null for single courses. */
  courseNumberTo: string | null;
  /**
   * " Required Courses: 1": how many courses of the range or attribute must
   * be passed. Set on every range seen, null on every single course.
   */
  requiredCourses: number | null;
  /** " Minimum Grade of C-" ("B", "B-", "C", "C-", "D", "D-"). */
  minimumGrade: string;
  /**
   * " May be taken concurrently." (true) or " May not be taken
   * concurrently." (false).
   */
  mayBeTakenConcurrently: boolean;
}

/**
 * A " Course Attributes:_Core Quantitative Reasoning A" rule: any course with
 * that attribute, by its description (`SectionAttributeDescriptions`), with no
 * space after the colon.
 */
export interface PrerequisiteAttribute {
  connector: PrerequisiteConnector;
  courseAttributes: string;
  /** Set on every attribute rule seen. */
  requiredCourses: number;
  minimumGrade: string;
  mayBeTakenConcurrently: boolean;
}

/**
 * A placement test or waiver line ("MATH PLMT CRS 1021 Y "). It has nothing
 * printed above it and follows a course, attribute or other test rule in the
 * same group, as an alternative way to meet that rule (the "or Test" of
 * "Course or Test").
 */
export interface PrerequisiteTest {
  connector: null;
  /** The line up to its last word or range ("MATH PLMT CRS 1021"). */
  testDescription: string;
  /** Its last word: "Y" on 178 of 180 tests; "C1002" in "… C1002 to C1002". */
  minimumScore: string;
  /** The end of a "C1002 to C1002" range; null otherwise. */
  maximumScore: string | null;
  /** False on every test seen. */
  mayBeTakenConcurrently: false;
}
