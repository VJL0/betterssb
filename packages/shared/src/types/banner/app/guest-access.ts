/**
 * What a guest gets from the routes that are not for guests, seen on
 * 2026-11-18. Paths are relative to `/StudentRegistrationSsb`. Every
 * redirect answers 302 with an empty body unless noted; follow it only to
 * learn the target, never sign in.
 *
 * Not called, because they end or change the session: `/logout` (the
 * Sign Out item), `/logout/timeout` (where the inactivity prompt goes when
 * nobody answers) and `POST /ssb/personaSelection/selectPersona` (the
 * `window.persona.controller`).
 *
 * `/login/auth` answers 200 with a 7,577-byte XHTML page titled "Sign In",
 * Grails Spring Security's own form (`#loginForm`, POST to
 * `/login/authenticate`), and so do `/ssb/term/login/auth`,
 * `/ssb/classSearch/login/auth` and `/ssb/courseSearch/login/auth`, where the
 * header's Sign In item lands from those pages (see
 * `BannerPageMeta.loginEndpoint`). `/ssb/login/auth` redirects to CAS
 * instead. Opened 5 times, never submitted.
 *
 * `/login/resetPassword` is where that form's `gotoForgotPassword()` posts
 * `#loginForm` (`username`, `password`). Temple's form renders no
 * `#forgotpasswordLink`, so nothing calls it; a bare guest GET answers 200
 * with the same "Sign In" page (7,631 bytes) showing "Enter a user name to
 * continue" in its error state. Opened once; never sent a username, which
 * would start a reset for that account.
 */

/**
 * 302 to the CAS login, always the same `Location`:
 * `https://fim.temple.edu/idp/profile/cas/login?TARGET=` + the encoded
 * `https://prd-xereg.temple.edu/StudentRegistrationSsb/login/cas` (22 of 22
 * redirects). With or without cookies; a request carrying the session's
 * cookies gets no new ones. Unknown controllers redirect the same way
 * (`/ssb/doesNotExist`, `/doesNotExist`), unlike an unknown action of a known
 * one (a 404 page).
 */
export type SignInRedirectPath =
  | "/ssb"
  | "/ssb/"
  | "/ssb/registration/registerPostSignIn?mode=registration"
  | "/ssb/registration/registerPostSignIn?mode=plan"
  | "/ssb/registration/registerPostSignIn?mode=preReg"
  | "/ssb/registrationHistory/registrationHistory"
  /**
   * The Help link's JSON (Banner's page would open its `url` +
   * "/bannerOH?productName=…"), even with `X-Requested-With`.
   */
  | "/ssb/help/url"
  /**
   * The page Banner opens when an app meant for Ellucian Experience is
   * loaded outside its iframe (never the case at Temple).
   */
  | "/error/standaloneApplication"
  /** Where the header's Sign In item lands from the landing page. */
  | "/ssb/login/auth"
  /** The Tools menu's admin items (theme editor, i18n upload). */
  | "/ssb/themeEditor"
  | "/ssb/uploadProperties"
  /** The standalone menu XML Banner's header falls back to after `/menu`. */
  | "/ssb/xml/navigation.xml"
  /** Where the header's brand link goes when `globalGuestProxyBaseURL` is set. */
  | "/ssb/proxy/onReturn"
  | "/ssb/i18n"
  | "/ssb/webAppExtensibility"
  | "/ssb/securityQA"
  | "/ssb/survey/survey"
  | "/ssb/studentAttributes"
  /** Outside `/ssb`; `/ssb/theme/getTheme` is open (see `ThemeQuery`). */
  | "/theme/getTheme";

/**
 * 302 to the absolute
 * `https://prd-xereg.temple.edu/StudentRegistrationSsb/ssb/registration/registration`
 * (6 of 6). The three `termSelection` modes still send the whole ~59 KB term
 * page as the redirect's body.
 */
export type LandingRedirectPath =
  | "/ssb/term/termSelection?mode=registration"
  | "/ssb/term/termSelection?mode=plan"
  | "/ssb/term/termSelection?mode=preReg"
  /** Only before the session picked a term. */
  | "/ssb/classSearch/classSearch"
  /**
   * Only before the session picked a term; one picked with `mode=search`
   * already opens it.
   */
  | "/ssb/courseSearch/courseSearch";

/**
 * `GET /StudentRegistrationSsb/storageAccess/logout` (outside `/ssb`): 200
 * `text/html;charset=utf-8` with these 17 bytes. Banner's page only calls it
 * as a `navigator.sendBeacon` POST when it runs inside Ellucian Experience's
 * iframe (on unload, and from error pages), so never at Temple. Only called
 * here once, without cookies, so whether it ends a session is unknown.
 * `/ssb/storageAccess/…` paths redirect to the CAS login instead.
 */
export type StorageAccessLogoutResponse = "Logout successful";

/**
 * `GET /logout/customLogout`: 200, a 5,169-byte "Banner" page (layout
 * "bannerCommonPage") asking "Would you like to log out or return home?";
 * this is the data its two buttons carry. The `/login/error` page's OK
 * button opens it as `/logout/customLogout?error=true`. Opening it leaves the
 * session alone: the same `JSESSIONID`, and a class search right after
 * still returned its 441 sections (1 of 1).
 */
export interface CustomLogoutQuery {
  /** What the `/login/error` page's button sends; the page is the same without it. */
  error?: "true";
}

export interface CustomLogoutPage {
  /** The "LOG OUT" button: CAS's single sign-out, then TUportal. */
  logOut: "https://fim.temple.edu/idp/profile/cas/logout?url=https://tuportal.temple.edu";
  /** The "RETURN HOME" button. */
  returnHome: "https://prd-xereg.temple.edu/StudentRegistrationSsb";
}
