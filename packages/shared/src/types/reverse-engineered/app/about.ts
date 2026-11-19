/**
 * The About dialog's two reads. Banner's page calls them through Angular's
 * `$http` (not `$http.jsonp`) with `?callback=JSON_CALLBACK`, and the server
 * ignores `callback`: with it, with `callback=myCallback` and without it,
 * both answer plain JSON (`application/json;charset=UTF-8`), never JSONP. No
 * cookies needed; a request without them gets a fresh `JSESSIONID`.
 * Seen on 2026-11-18, 6 times each.
 */

import type { Open } from "../common";

/** Query Banner's page sends to both; optional and ignored. */
export interface JsonCallbackQuery {
  /** "JSON_CALLBACK". */
  callback?: string;
}

/**
 * `GET /ssb/about/data`. The same 783 bytes every time; keys are i18n
 * property names, dots included.
 */
export interface AboutResponse {
  "api.title": "About Banner";
  "api.close": "Close";
  "about.banner.application.name": "Banner Student Registration Self Service";
  /** "Application Version 9.40.0.1": Banner Student Registration SSB 9.40. */
  "about.banner.application.version": string;
  /** "2013-2026 Ellucian Company L.P. and its affiliates. All rights reserved." */
  "about.banner.copyright": string;
  "about.banner.copyrightLegalNotice": string;
  "about.banner.ellucianPrivacyNotice": "Ellucian Privacy Notice";
  "about.banner.ellucianPrivacyNoticeLink": "https://www.ellucian.com/privacy";
}

/**
 * `GET /ssb/serverInfo/index`. Names the app server that answered: the last
 * octet of its 10.96.192.x address, which the `BIGipServerprd_xereg_8180_pool`
 * cookie also encodes. The same within one cookie jar; a request without
 * cookies lands on any of the four.
 */
export interface ServerInfoResponse {
  serverNumber: ServerNumber;
}

export type ServerNumber = Open<"148" | "149" | "150" | "151">;
