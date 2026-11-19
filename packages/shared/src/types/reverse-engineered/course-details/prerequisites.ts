/**
 * The Prerequisites tab, `POST /ssb/courseSearchResults/getPrerequisites`.
 */

import type { CourseIdentity } from "./course-identity";

/**
 * Data carried by the Prerequisites fragment: an `<h3>Catalog
 * Prerequisites</h3>`, then a one-column `<table class="cappPreqTable
 * cappPreq-align">` headed "Area Prerequisites", or the text "No
 * prerequisite information available." (117 of 178 courses). An unknown
 * course, or a term before its first catalog version, gets 500 and
 * `CourseCatalogErrorPage` instead.
 *
 * Temple keeps prerequisites as CAPP areas, and each `<td>` is one line of
 * Banner's plain-text rendering of them, newlines and all:
 *
 * ```text
 * Prerequisites:PR: Legal and Moral Issues\n
 * General Requirements:
 * (\n Course or Test: Advertising 1101 \n Minimum Grade of C\n May not be taken concurrently.
 * ADV1101 - CR Grade Y \n May not be taken concurrently.
 * )\nand\n(\n Course or Test: Advertising 1102 \n …
 * )
 * ```
 *
 * Each area opens with a "Prerequisites:" row and a "General Requirements:"
 * row, then its requirements in parenthesized groups: a row that opens
 * with "(" or ")\nand\n(" (or "or") starts a group, an "and\n" row adds a
 * course to it, a row without a label (a test) follows a course, attribute
 * or test row and never opens a group, and a lone ")" row closes the last
 * group. A rule row inlines its own conditions and ends the area without a
 * ")" row (2 of 2). The interfaces below are those rows parsed; the text
 * gives no precedence between "and" and "or".
 *
 * The section dialog's `searchResults/getSectionPrerequisites` prints the
 * same text as `<pre>` blocks inside one `<td>` and leaves out the "General
 * Requirements:" row.
 */
export interface CoursePrerequisites {
  /**
   * One per "Prerequisites:" row, in Banner's order. Empty for "No
   * prerequisite information available."; one area for 60 of the 61
   * courses with any, two for RMI 3581 (a GPA area, then its course area).
   */
  areas: PrerequisiteArea[];
  courseIdentity?: CourseIdentity;
}

export interface PrerequisiteArea {
  /**
   * The rest of the "Prerequisites:" row, trailing spaces trimmed: the CAPP
   * area's description, "PR: " (on all 62 areas) and usually the
   * abbreviated title ("PR: Landscape", "PR: GPA 3.0 Requirement").
   */
  area: string;
  /**
   * The rest of the "General Requirements:" row, trimmed: empty for 60 of 62
   * areas, "3 gpa" for both of RMI 3581's.
   */
  generalRequirements: string;
  /**
   * The rows after "General Requirements:", grouped by their parentheses.
   * An area whose one requirement has no "(" (RMI 3581's GPA area) is one
   * group with no ")" row.
   */
  groups: PrerequisiteGroup[];
}

export interface PrerequisiteGroup {
  /**
   * The "and" or "or" between ")" and "(" before the group; null for the
   * first group of every area.
   */
  connector: "and" | "or" | null;
  requirements: PrerequisiteRequirement[];
}

/**
 * Narrow with `"subject" in`, `"courseAttributes" in`, `"requiredCredits"
 * in`, `"test" in` or `"rule" in`. Over the 178 courses: 242 course rows,
 * 177 tests, 4 attribute rows, 1 credits row and 2 rules.
 */
export type PrerequisiteRequirement =
  | CourseRequirement
  | AttributeRequirement
  | CreditsRequirement
  | TestRequirement
  | RuleRequirement;

/**
 * A "Course or Test:" row ("Course or Test: Mathematics 1038 to 4999\n
 * Required Courses: 1\n Minimum Grade of C-\n May be taken concurrently.").
 */
export interface CourseRequirement {
  /**
   * "and" for a row that opens with "and\n" inside a group (7 of 242);
   * else null.
   */
  connector: "and" | null;
  /**
   * The subject's description, not its code, HTML-escaped and possibly with
   * commas ("Computer &amp; Information Science", "Obstetrics,Gynecology
   * &amp; Reprod").
   */
  subject: string;
  /** The word after the subject ("1068", "M320"); the low end of a range. */
  courseNumber: string;
  /**
   * High end of a range ("Mathematics 1038 to 4999"): any course between.
   * On 17 of 242 rows, always with `requiredCourses`.
   */
  courseNumberTo?: string;
  /** "Required Courses:" line, only on ranges, always "1". */
  requiredCourses?: string;
  /** "Minimum Grade of" line ("C-", "C", "B-", "P", "D", "S-", "CR"). */
  minimumGrade: string;
  concurrency: Concurrency;
}

/**
 * A "Course Attributes:" row: any course carrying that attribute
 * ("Course Attributes:_Core Quantitative Reasoning A\n Required Courses:
 * 1\n Minimum Grade of C-\n May not be taken concurrently."). Seen on ECON
 * 1101 and ECON 1901, two each.
 */
export interface AttributeRequirement {
  connector: null;
  /** The attribute's description, not its code ("_Core Quantitative Reasoning B"). */
  courseAttributes: string;
  /** Always "1". */
  requiredCourses: string;
  minimumGrade: string;
  concurrency: Concurrency;
}

/**
 * A course-number range with no subject and a credit count
 * (" 0700 to 4999\n Required Credits: 0.0\n May not be taken
 * concurrently."): the one requirement of RMI 3581's "PR: GPA 3.0
 * Requirement" area, the only one seen.
 */
export interface CreditsRequirement {
  connector: null;
  courseNumber: string;
  courseNumberTo: string;
  /** "Required Credits:" line, with one decimal ("0.0"). */
  requiredCredits: string;
  concurrency: Concurrency;
}

/**
 * A test score row, printed without a label right after a course,
 * attribute or other test row ("MATH PLMT CRS 1041 Y \n May not be taken
 * concurrently."). Temple also
 * uses tests for waivers and credit-by-grade ("ADV1101 - CR Grade Y").
 */
export interface TestRequirement {
  /** Always null: test rows have no connector. */
  connector: null;
  /** The test's description ("MATH PLMT CRS 1041", "RM01, C or above in RMI 2101"). */
  test: string;
  /**
   * The last word before the line break: "Y" for 174 of 177, else a score
   * range's low end ("C1003", "B1003", "EXMPT").
   */
  minimumScore: string;
  /**
   * "to" end of a score range, equal to `minimumScore` on all 3 seen
   * ("LANG COURSE PLMT - SPANISH C1003 to C1003").
   */
  maximumScore?: string;
  concurrency: Concurrency;
}

/**
 * A CAPP rule, one row of the form "Rule: ADV1: Complete 3 of the following
 * for a total of 3 conditions )\nand\n(Advertising 2111  Minimum Grade of
 * C\n May not be taken concurrently. )\nor\n(…)End of Rule ADV1". Two seen,
 * on ADV 3012 and ISE 4176.
 */
export interface RuleRequirement {
  connector: "and" | null;
  /** The rule's name, between "Rule: " and the next colon ("ADV1"). */
  rule: string;
  /** Up to " )", with Banner's double space kept ("Complete 3 of the following  for a total of 3 conditions"). */
  description: string;
  /** 10 and 3 conditions on the two rules seen. */
  conditions: RuleCondition[];
}

/**
 * One "\nand\n(…)" or "\nor\n(…)" condition of a rule. Courses here have no
 * "Course or Test:" label and test rows no line break.
 */
export type RuleCondition = RuleCourseCondition | RuleTestCondition;

export interface RuleCourseCondition {
  connector: "and" | "or";
  /** Subject description ("Advertising"). */
  subject: string;
  courseNumber: string;
  minimumGrade: string;
  concurrency: Concurrency;
}

export interface RuleTestCondition {
  connector: "and" | "or";
  /** Test description ("ADV2111 - CR Grade"). */
  test: string;
  minimumScore: string;
  concurrency: Concurrency;
}

/** The last line of every course, attribute, credits and test row. */
export type Concurrency =
  "May be taken concurrently." | "May not be taken concurrently.";
