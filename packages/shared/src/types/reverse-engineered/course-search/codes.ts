/**
 * Code lists of the Browse Course Catalog, as its course rows and filters
 * showed them for 2026 Summer I, 2026 Fall and 2027 Spring on 2026-11-18,
 * each left `Open`. Colleges and divisions reuse the course details lists
 * (`CollegeDescriptions`, `DivisionDescriptions`), whose codes are the ones
 * the catalog's filters take.
 */

import type { Open } from "../common";
import type {
  CollegeDescriptions,
  DivisionDescriptions,
} from "../course-details/codes";

/**
 * A course row's `collegeCode`: the 19 colleges of `CollegeDescriptions` and
 * "00" ("No College Designated", 63 rows). 2026 Summer I had no GS course.
 */
export type CatalogCollegeCode = Open<keyof CollegeDescriptions | "00">;

/**
 * The divisions `txt_division` finds, by code. The `get_division` picker
 * offers only GR and UG, but 2026 Fall's catalog answered every code here
 * (LG with 1 course); "MD", "DE", "PM" and lowercase "ug" found nothing.
 * Course rows carry the description only, in `division`.
 */
export interface CatalogDivisionDescriptions extends DivisionDescriptions {
  LG: "Law Graduate";
}
export type CatalogDivisionCode = Open<keyof CatalogDivisionDescriptions>;

/**
 * A course row's `division`. Over the 38,632 rows: Undergraduate 20,288,
 * Graduate 14,229, Law 2,845, Medicine 496, Dentistry 400, Pharmacy 371 and
 * Law Graduate 3.
 */
export type CatalogDivision = Open<
  CatalogDivisionDescriptions[keyof CatalogDivisionDescriptions]
>;

/** The two codes of the `get_division` picker. */
export type LookupDivision = Open<"GR" | "UG">;

/**
 * `preRequisiteCheckMethodCde`: "B" on 27,944 rows, "C" on 10,688. The
 * captures don't say what the codes mean.
 */
export type PrerequisiteCheckMethod = Open<"B" | "C">;
