/**
 * The five lookups whose list doesn't depend on the term: `GET
 * /ssb/classSearch/get_campus`, `get_college`, `get_attribute`,
 * `get_instructionalMethod` and `get_session` (`LookupQuery`). Each returned
 * the same rows for 2026 Summer I, 2026 Fall and 2027 Spring, and for a
 * missing, empty or unknown ("999999") `term`; each ignores `offset` and
 * `max` and lists everything that matches `searchTerm`, even with no
 * parameters at all. Their codes go in the `searchResults` filter named after
 * the picker's input: `txt_campus`, `txt_college`, `txt_attribute`,
 * `txt_instructionalMethod` and `txt_session`, comma-separated for several.
 * Same JSON format as `get_subject`, sorted by description in code-point
 * order of the unescaped text ("Zero Textbook Cost" before "_Core Am
 * Cult/St Race/Writing", "QA/RA Pharmacy - Virginia" before "QA/RA Pharmacy
 * &ndash; Frazer, PA"). Descriptions are HTML-escaped; `codes.ts` lists them.
 */

import type { CodeDescription } from "../common";
import type {
  LookupAttribute,
  LookupCampus,
  LookupCollege,
  LookupInstructionalMethod,
  LookupSession,
} from "./codes";

/** 38 rows. */
export type GetCampusResponse = CodeDescription<LookupCampus>[];

/** 17 rows. */
export type GetCollegeResponse = CodeDescription<LookupCollege>[];

/** 32 rows. */
export type GetAttributeResponse = CodeDescription<LookupAttribute>[];

/** 11 rows. */
export type GetInstructionalMethodResponse =
  CodeDescription<LookupInstructionalMethod>[];

/** 3 rows. */
export type GetSessionResponse = CodeDescription<LookupSession>[];
