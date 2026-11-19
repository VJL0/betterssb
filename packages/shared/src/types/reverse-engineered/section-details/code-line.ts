/**
 * A "Description  CODE" line, the way the Catalog tab lists college,
 * division, department, levels, grading modes, schedule types and
 * attributes, and the way `POST /ssb/searchResults/getSectionAttributes`
 * (the "Attributes" tab) lists the section's attributes. Banner prints the
 * description, two spaces and the code
 * ("Sustainable Econ &amp; Politics  SP"), so split at the last run of two
 * or more spaces: none of the 1,349 descriptions seen held two spaces in a
 * row.
 *
 * The Attributes fragment (117 to 960 bytes) is one `<section
 * aria-labelledby="attributes">` holding a `<div><span
 * class='attribute-text'>` per attribute, each line but the last ending in
 * a `<br/>` inside the span. Its data is `CodeLine<SectionAttributeCode>[]`:
 * the row's `sectionAttributes`, in that order, code and decoded
 * description, for all 150 listed sections. With no attributes the section
 * holds only the text "No Attribute information available." instead (96 of
 * the 156 sampled, which leaned on attributes; 14,473 of the 19,739
 * sections in the three terms' `searchResults`, about 73%, have none).
 */
export interface CodeLine<Code extends string = string> {
  /**
   * Decoded, as a DOM parser reads it ("Sustainable Econ & Politics"); the
   * markup HTML-escapes it.
   */
  description: string;
  code: Code;
}
