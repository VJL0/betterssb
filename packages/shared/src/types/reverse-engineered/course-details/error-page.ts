import type { BannerErrorPage } from "../common";

/**
 * What Catalog, Prerequisites and Fees return, with status 500 and
 * `text/html;charset=UTF-8`, when the form doesn't name a course in effect
 * for the term: Banner's full "Sorry, the server received an internal
 * error." page (6,031 bytes, titled "Banner"), not a fragment. All 29
 * captured (13 from Catalog, 10 from Prerequisites, 6 from Fees) were the
 * same bytes but for the order of the two class names. The
 * response is a `string`; this is the data its `<head>` carries.
 */
export interface CourseCatalogErrorPage extends BannerErrorPage {
  /** Empty on all 29. */
  openSSBInExperience: "";
  errorCode: "500";
  /**
   * `<meta name="errorMessage">`, HTML-escaped, a Groovy exception message
   * that the page body prints again under "Error Message:". Always four
   * lines: "Ambiguous method overloading for method
   * net.hedtech.banner.student.catalog.CatalogDecorator#&lt;init&gt;.",
   * "Cannot resolve which method to invoke for [null] due to overlapping
   * prototypes between:", then "\t[class
   * net.hedtech.banner.student.catalog.CourseSearch]" and "\t[class
   * net.hedtech.banner.student.catalog.CourseGeneralInformation]" in either
   * order (24 one way, 5 the other).
   */
  errorMessage: string;
}
