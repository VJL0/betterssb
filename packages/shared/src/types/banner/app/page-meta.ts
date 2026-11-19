/**
 * The `<meta name content>` tags in the `<head>` of every full Banner page,
 * read from 9 guest pages captured on 2026-11-18 (the landing page, both
 * term-selection modes, class search and course search, each with and without
 * a picked term) and compared with the 26 signed-in pages of the user's HAR
 * captures. Every content is a string, as the HTML carries it; Banner's own
 * scripts read them with `$("meta[name=…]").attr("content")`.
 *
 * Pages also carry two `http-equiv` metas (`Content-Type` "text/html;
 * charset=UTF-8" and `X-UA-Compatible` "IE=edge"), left out because they have
 * no `name`.
 */

/**
 * Keyed by each tag's `name`. A value typed as a literal never varied across
 * the guest pages; signed-in values are noted where they differ.
 */
export interface BannerPageMeta {
  /** Text direction, "ltr"; Banner's page flips its side panels when "rtl". */
  dir: "ltr";
  /**
   * A UUID ("1c492b2e-0c56-44a2-b608-dab7e8030a9f") that changes on every
   * page load, even within one session. Banner's `$.ajaxPrefilter` sends it
   * back as an `X-Synchronizer-Token` header on every jQuery request, but no
   * guest call checks it: `term/search`, `searchResults` and `resetDataForm`
   * answered the same with the header missing, with a made-up UUID and with
   * the page's real token.
   */
  synchronizerToken: string;
  /** log4javascript level for the browser console. */
  logLevel: "ERROR";
  /**
   * Seconds the server keeps an idle session: "1800" for guests, "3600" on
   * signed-in pages. Banner's page warns 90 seconds before it runs out, and
   * goes to `logout/timeout` if nobody answers within 60 seconds.
   */
  maxInactiveInterval: "1800" | "3600";
  /**
   * Seconds; Banner's page sets jQuery's AJAX timeout to this plus 10 (310
   * seconds). Falls back to 30 when the tag is missing.
   */
  transactionTimeout: "300";
  viewport: "width=device-width, initial-scale=1";
  "apple-mobile-web-app-capable": "yes";
  "mobile-web-app-capable": "yes";
  /** Path the inactivity prompt's "keep alive" button GETs. */
  keepAliveURL: "/StudentRegistrationSsb/ssb/keepAlive/data";
  /** Multi-institution (MEP) home context; empty at Temple. */
  ssbMepDesc: "";
  /**
   * The signed-in student's display name; empty for guests. Banner's page
   * treats a non-empty value as "signed in" (`CommonContext.user`), which is
   * what sends the landing page's sign-in tiles to `data-endpoint` instead of
   * `data-login`.
   */
  fullName: string;
  /**
   * Empty, so the header's Sign In item falls back to the relative URL
   * "login/auth". From the landing page that is `/ssb/login/auth`, a 302 to
   * the CAS login; from the term, class search and course search pages it is
   * `/ssb/term/login/auth` and so on, which answer Grails Spring Security's
   * own "Sign In" form (the same 7,577 bytes as `/login/auth`).
   */
  loginEndpoint: "";
  /** Empty, so Sign Out falls back to the relative "logout". */
  logoutEndpoint: "";
  /** "true" would add a guest sign-in item to the Sign In menu. */
  guestLoginEnabled: "false";
  /** Non-empty would hide the Banner menu (Ellucian's proxy-access mode). */
  guestAuthenticationEnabled: "";
  /** Brand-link base for proxy access; empty. */
  globalGuestProxyBaseURL: "";
  /** Java-style locale, "en_US". */
  userLocale: "en_US";
  /** Milliseconds before the "last login" footer fades; 2000 if unset. */
  footerFadeAwayTime: "2000";
  /** "true" hides Banner's header when the app runs inside an iframe. */
  hideSSBHeaderComps: "false";
  /**
   * "true" when the app is embedded in Ellucian Experience; the page then
   * redirects to `/error/standaloneApplication` when opened on its own.
   */
  openSSBInExperience: "false";
  /** Empty, so the About dialog GETs `aboutUrlContextPath + "/about/data"`. */
  aboutUrl: "";
  privacyPolicyUrl: "";
  aboutUrlContextPath: "/StudentRegistrationSsb/ssb";
  requestContext: "/StudentRegistrationSsb";
  /**
   * Action Item Processing: "true" would prompt the student to visit
   * `aipUrl`. Empty for guests, "false" on every signed-in page.
   */
  hasActiveActionItems: "" | "false";
  aipUrl: "";
  /**
   * The analytics-cookie choice: empty for guests and for students who never
   * answered, "Y" on 12 of 26 signed-in pages ("N" would mean declined).
   */
  isUsageTrackingEnabled: "" | "Y";
  /** Fetched only when signed in; see `UsageTrackingResponse`. */
  usageTrackingURL: "/StudentRegistrationSsb/ssb/userPreference/fetchUsageTracking";
  /** "false" removes the language picker from the Tools menu. */
  isLanguageSettingRequired: "false";
  switchTojqueryLegacy: "false";
  /** Grails layout of the page; error pages use "bannerCommonPage". */
  layout: "bannerWebPage";
  /** Where Banner's header loads its menu XML from. */
  menuEndPoint: "/StudentRegistrationSsb/ssb/selfServiceMenu/data";
  /** Base that Banner's scripts build `/ssb/…` URLs from. */
  menuBaseURL: "/StudentRegistrationSsb/ssb";
  /**
   * Always empty in the HTML; an inline script then fills it with
   * `JSON.stringify` of a `HeaderAttributes`, so read it after scripts run or
   * parse that script.
   */
  headerAttributes: "";
  /** Only on the landing page (`/ssb/registration`), never on the others. */
  applicationVersion?: "null-null";
}
