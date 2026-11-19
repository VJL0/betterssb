/**
 * How a guest session lives, from 12 probe sessions on 2026-11-18. Banner
 * keeps all of it server-side: the picked term (`term/search`) and the
 * search caches (see `ResetDataFormRequest`) belong to the `JSESSIONID`, on
 * the one app server the `BIGipServer…` cookie pins.
 *
 * - **Starting one**: any response under `/StudentRegistrationSsb/` sets all
 *   four cookies to a request that has none; the term-selection page or the
 *   landing page is the usual first call.
 * - **`uniqueSessionId` is not checked.** Banner's page makes one (5 random
 *   base-36 characters + epoch milliseconds) and sends it with `term/search`,
 *   `searchResults` and the lookups, but a search with another id, an empty
 *   one or none at all returned the session's results the same. Two ids in
 *   one cookie jar share one term: the last `term/search` wins for both.
 * - **`txt_term` must match the session's term**: once the cache is empty, a
 *   `searchResults` for another term (or without `txt_term`) answers
 *   `success: true, totalCount: 0, data: null` with `pathMode` still set.
 * - **Cookies without the pin start over**: `JSESSIONID` sent without
 *   `BIGipServer…` landed on another app server and got a new, termless
 *   session in 6 of 6 tries. The two `TS…` cookies can be dropped.
 * - **A 500 response ends it** (new `JSESSIONID`); 404s and redirects don't.
 * - **`synchronizerToken`** (`X-Synchronizer-Token`) is never checked for
 *   guests; see `BannerPageMeta.synchronizerToken`.
 * - Responses to a request with `X-Requested-With` carry `Cache-Control:
 *   no-cache,no-store` and `Expires: -1` (128 of 130; the other two were
 *   redirects); without the header, none do. No guest response carried the
 *   `X-Login-Page: true` header that makes Banner's page reload, and none
 *   allowed cross-origin reads (no `Access-Control-Allow-Origin`, even for an
 *   `Origin` request).
 */

/**
 * The cookies a first response sets, by name. All are `Secure` and
 * `HttpOnly`. `grails_remember_me` only ever appears being cleared (`Max-Age=0`)
 * by a 500 page.
 */
export interface BannerSessionCookies {
  /**
   * Tomcat session id, 32 uppercase hex characters; `Path=/StudentRegistrationSsb`.
   * Not set by the bare `/StudentRegistrationSsb` redirect.
   */
  JSESSIONID: string;
  /**
   * F5 BIG-IP persistence, `path=/`: the app server's IPv4 address as a
   * little-endian integer, its port byte-swapped, then "0000"
   * ("2545967114.62495.0000" is 10.96.192.151:8180). Four servers were seen,
   * 10.96.192.148 to .151; `serverInfo/index` names the same one.
   */
  BIGipServerprd_xereg_8180_pool: string;
  /**
   * F5 web-firewall cookies, `SameSite=Strict`, re-set on most responses
   * (`TS01dc4fc6` with `Path=/`, `TS0161403d` with
   * `path=/StudentRegistrationSsb`). Requests without both kept the session.
   */
  TS01dc4fc6: string;
  TS0161403d: string;
}
