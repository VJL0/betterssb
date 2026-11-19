/**
 * The Attributes tab, `POST /ssb/courseSearchResults/getCourseAttributes`.
 */

import type { CodeDescription } from "../common";
import type { SectionAttributeCode } from "../search-results/index";
import type { CourseIdentity } from "./course-identity";

/**
 * Data carried by the Attributes fragment, a `<section
 * aria-labelledby="attributes">` of bare "Description  CODE" text joined by
 * `<br/>` ("Honors  HO<br/>_Core Science &amp; Technology A  SA"), or "No
 * Attribute information available." for a course without any, an unknown
 * course or a bad form (always 200).
 *
 * These are the course's catalog attributes, not its sections': the section
 * dialog's `searchResults/getSectionAttributes` wraps each in `<div><span
 * class='attribute-text'>` and lists what the section carries.
 */
export interface CourseAttributes {
  /** Sorted by code. Empty for "No Attribute information available." */
  attributes: CodeDescription<SectionAttributeCode>[];
  courseIdentity?: CourseIdentity;
}
