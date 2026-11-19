/**
 * `GET /ssb/classSearch/get_partOfTerm` (`PartOfTermQuery`), the Part Of Term
 * picker; its codes go in `txt_partOfTerm` of `searchResults`. Returns the
 * whole list whatever `offset` and `max` say. Same JSON format as
 * `get_subject`.
 */

import type { CodeDescription } from "../common";
import type { LookupPartOfTerm } from "./codes";

/**
 * 11 parts of term in 2026 Summer I, 12 in Fall and 12 in Spring, sorted by
 * description in code-point order ("12-week…" before "4-week…").
 */
export type GetPartOfTermResponse = PartOfTermOption[];

export interface PartOfTermOption extends CodeDescription<LookupPartOfTerm> {
  /**
   * The name followed by the part's first and last day in the term, "MM/DD/YYYY
   * - MM/DD/YYYY" ("7-week Courses (7A) 01/11/2027 - 03/08/2027"), on 35 of 35.
   * `searchTerm` matches the name only ("01/11/2027" finds nothing).
   */
  description: string;
}
