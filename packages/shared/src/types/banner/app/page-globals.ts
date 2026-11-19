/**
 * Globals that inline `<script>`s of every full Banner page set, the same on
 * all 9 guest pages captured on 2026-11-18 except where noted. They are
 * JavaScript, not JSON (`window.persona` has unquoted keys and a variable),
 * so read them from the page's `window` or parse each assignment.
 *
 * Every page also sets `window.mepCode = ''` (always empty at Temple) and,
 * on the term-selection page, `window.appContext = '/StudentRegistrationSsb'`.
 */

/** `var extensibilityInfo`, for Ellucian's page-extension framework. */
export interface ExtensibilityInfo {
  application: "StudentRegistrationSsb";
  page: ExtensibilityPage;
  url: "/StudentRegistrationSsb/";
  pluginUrl: "/StudentRegistrationSsb/plugins/web-app-extensibility-12.0/static/html/";
  admin: false;
  /** Always empty: Temple ships no page extensions. */
  extensions: Record<string, never>;
  resources: null;
}

/** The Grails controller of the page. */
export type ExtensibilityPage =
  "registration" | "term" | "classSearch" | "courseSearch";

/**
 * What an inline script writes into `<meta name="headerAttributes">` as
 * `JSON.stringify(…)`; Banner's header draws the title and breadcrumbs
 * from it.
 */
export interface HeaderAttributes {
  /**
   * Not always the `<title>`: the class and course search pages are titled
   * "Class Search" and "Course Search".
   */
  pageTitle:
    "Registration" | "Select a Term" | "Browse Classes" | "Browse Courses";
  /**
   * Crumb label to path, in order. Paths are relative to `/ssb`
   * ("/registration", "/term/termSelection?mode=search") and empty for the
   * current page: `{ Student: "/registration", Registration:
   * "/registration", "Select a Term": "" }`.
   */
  breadcrumb: Record<string, string>;
}

/**
 * `window.persona`. Guests have no personas; the landing page then sets
 * `changePersona` to true in a later script, the other pages leave it false.
 */
export interface PersonaGlobal {
  availablePersonas: [];
  changePersona: boolean;
  controller: "/StudentRegistrationSsb/ssb/personaSelection/selectPersona";
}

/**
 * `$.i18n.map`, every message string Banner's scripts show, as one JSON
 * object literal in the page's last inline script (about 40 KB). The same
 * 608 keys and values on every guest page. Values are plain text with
 * `{0}`-style placeholders (100 of them) and a few HTML entities. Listed here
 * are the keys that say how Banner formats the dates, times and codes in its
 * responses.
 */
export interface BannerI18nMap {
  [key: string]: string;
  "default.calendar": "gregorian";
  /** Java `SimpleDateFormat` pattern of `BannerDate` values, "MM/dd/yyyy". */
  "default.date.format": "MM/dd/yyyy";
  "default.date.display.format": "MM/dd/yyyy";
  /** What the date pickers accept typed in, "MM/dd/yy". */
  "default.dateEntry.format": "MM/dd/yy";
  "default.time.format": "HH:mm";
  /** "12": Banner's page shows `BannerTime` values as 12-hour clock. */
  "js.date.time.format": "12";
  /** Hour, minute, AM/PM, as the results table prints meeting times. */
  "js.searchResults.time.format": "{0}:{1} {2}";
  /** "0", Sunday, as in `Date.getDay()`. */
  "default.firstDayOfTheWeek": "0";
  /** Comma-separated, Sunday first. */
  "default.gregorian.dayNames": "Sunday,Monday,Tuesday,Wednesday,Thursday,Friday,Saturday";
  "default.gregorian.dayNamesShort": "Sun,Mon,Tue,Wed,Thu,Fri,Sat";
  "default.gregorian.amPm": "AM,PM";
  /** Notification Banner's page shows when a search answers `success: false`. */
  "default.internal.error": string;
  /** Tooltip of the zero-textbook-cost badge. */
  "ZeroTextbookCostProgramIcon.tooltip.message": "Zero Textbook Cost Program";
}
