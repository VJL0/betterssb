/**
 * `GET /ssb/theme/getTheme`, the app's own copy of Temple's theme
 * stylesheet. Banner's pages don't call it: they link the same name and
 * template on Ellucian's theme server
 * (`https://theme.elluciancloud.com/001G000000iHnQtIAK/theme/getTheme?name=prod_ssb&template=StudentRegistrationSsb-9_40_0_1`)
 * in a `<link rel="stylesheet">`. `/StudentRegistrationSsb/theme/getTheme`,
 * outside `/ssb`, redirects to the CAS login instead.
 *
 * Answers 200 `text/css;charset=utf-8`, so the response is a `string`: the
 * same 68,338 bytes every time (3 calls on 2026-11-18, with and without
 * cookies), opening with a comment naming "StudentRegistrationSsb-9_40_0_1.scss"
 * and version 9.40.0.1, then the colour rules of 19 modules, each under a
 * comment naming its stylesheet ("classSearch.css", "term.css").
 */

/**
 * Without `name` the route is a 500 page ("Assertion failed: assert
 * params.name"); an unknown name is a 404 with an empty `text/css` body.
 */
export interface ThemeQuery {
  /** Required. "prod_ssb", Temple's theme. */
  name: string;
  /**
   * "StudentRegistrationSsb-9_40_0_1" on Banner's link; leaving it out
   * returned the same bytes.
   */
  template?: string;
}
