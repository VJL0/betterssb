/**
 * The guest landing page, `GET /StudentRegistrationSsb/ssb/registration`
 * (60,835 bytes, titled "Registration"). `/ssb/registration/registration` is
 * the same page byte for byte apart from `synchronizerToken`, and so is the
 * page after a term was picked. It needs no cookies and sets the session ones
 * on a first visit. The response is a `string`; below is the data it carries.
 *
 * How guests get there: `GET /StudentRegistrationSsb` is a 302 to
 * `/StudentRegistrationSsb/` (no `JSESSIONID` yet, only the load-balancer
 * cookies), which is a 374-byte XHTML page whose
 * `<meta HTTP-EQUIV="REFRESH" content="0; url=ssb/registration">` goes on
 * here. `/StudentRegistrationSsb/ssb` and `/ssb/` redirect to the CAS login.
 *
 * The HTML holds seven tiles (`LandingPath`) in a hidden `.menu-container`;
 * Banner's script moves the four that `window.landingConfig` names into
 * `#landingPathMenu` in that order and drops the rest, so guests see Browse
 * Course Catalog, Browse Classes, Plan Your Schedule and Register for Classes.
 * Only the two browse tiles work without signing in.
 */

/** `window.landingConfig`, which tiles to show and their titles. */
export interface LandingConfig {
  /**
   * Always these four, in this order: `landingBrowseCourseCatalog`,
   * `landingBrowseClasses`, `landingPlanAhead`, `landingRegister`.
   */
  landingPageConfig: LandingPageConfig[];
}

export interface LandingPageConfig {
  /** The tile's class, matched against `LandingPath.config`. */
  config: LandingPathConfig;
  /** "Browse Classes(Class Schedule)", with no space before the parenthesis. */
  display: string;
  /** Equal to `display`; Banner's script prepends it to the tile's `span.title`. */
  title: string;
  /** True only for `landingRegister`. */
  required: boolean;
}

/** `window.registrationInitErrors`, always empty for guests. */
export interface RegistrationInitErrors {
  notification: [];
}

/**
 * One `<li class="landing-path …">` tile and its `<a>`. What each does for a
 * guest, all seen on 2026-11-18:
 *
 * - `catalogSearch` / `classSearch`: plain links to
 *   `/ssb/term/termSelection?mode=courseSearch` and `?mode=search`, 200.
 * - `register`, `worksheetPlanner`, `preRegActivities`: `href="#"`; Banner's
 *   script sends guests to `data-login`
 *   (`/ssb/registration/registerPostSignIn?mode=…`), a 302 to the CAS login.
 *   Their `data-endpoint` (`termSelection?mode=registration`, `plan`,
 *   `preReg`) is a 302 back to `/ssb/registration/registration`, with the
 *   whole term-selection page still sent as the redirect's body.
 * - `registrationHistory`: `data-endpoint` and `data-login` are both
 *   `/ssb/registrationHistory/registrationHistory`, a 302 to the CAS login.
 * - `curriculumInfo`: disabled (its click does nothing). Its `href`,
 *   `/ssb/term/termSelection` with no `mode`, is a 500 that ends the session.
 */
export interface LandingPath {
  /** `<li id>`. */
  id: LandingPathId;
  /** The `<li>`'s `landing…` class. */
  config: LandingPathConfig;
  /** The `<li>` has class `disabled` and `aria-disabled="true"`; only `curriculumInfo`. */
  disabled: boolean;
  /** `<a id>`. */
  linkId: LandingLinkId;
  /** Full path ("/StudentRegistrationSsb/ssb/term/termSelection?mode=search"), or "#" on the script-driven tiles. */
  href: string;
  /** `data-endpoint`, where a signed-in student goes; only on the `href="#"` tiles. */
  dataEndpoint?: string;
  /** `data-login`, where a guest goes; only on the `href="#"` tiles. */
  dataLogin?: string;
  /** Visually hidden `span.signin-message` ("You must be logged in to Search and Register."); only on the `href="#"` tiles. */
  signinMessage?: string;
  /** `h3.sub-link`, the tile's description. */
  description: string;
}

export type LandingPathId =
  | "register"
  | "worksheetPlanner"
  | "curriculumInfo"
  | "classSearch"
  | "registrationHistory"
  | "catalogSearch"
  | "preRegActivities";

export type LandingPathConfig =
  | "landingRegister"
  | "landingPlanAhead"
  | "landingDegreeDetails"
  | "landingBrowseClasses"
  | "landingRegistrationInformation"
  | "landingBrowseCourseCatalog"
  | "landingPreRegisterActivities";

/** In tile order: `register` has `registerLink`, `worksheetPlanner` has `planningLink`, and so on. */
export type LandingLinkId =
  | "registerLink"
  | "planningLink"
  | "curriculumInfoLink"
  | "classSearchLink"
  | "regHistoryLink"
  | "catalogSearchLink"
  | "preRegLink";
