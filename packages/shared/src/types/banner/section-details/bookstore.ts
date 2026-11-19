/**
 * Data carried by `POST /ssb/searchResults/getSectionBookstoreDetails`, the
 * "Bookstore Links" tab (493 to 496 bytes): one `<section
 * aria-labelledby="bookstore">` with a "Bookstore Links" heading in a
 * `<span class="status-bold">`, the fixed line "Use the link(s) below to
 * access online bookstores to determine the cost of required materials."
 * and a `div.indent-left` of links. Every one of the 156 fragments had
 * exactly one link, so the tab's data is `[BookstoreLink]` and carries
 * nothing beyond the row's `bookstores` in `searchResults`.
 */
export interface BookstoreLink {
  /**
   * The `<a target="_blank">`'s `href`, always
   * "https://www.bkstr.com/webApp/discoverView?bookstore_id-1=2360&term_id-1=<term>&crn-1=<crn>"
   * with the section's own term and CRN; the markup escapes each "&" as
   * "&amp;". Equal to `bookstores[0].url` of the same row once that is
   * unescaped too.
   */
  url: string;
  /** The link's text. */
  label: "View Course Materials";
}
