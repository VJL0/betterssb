/**
 * Banner pages sign themselves out after their own idle timeout
 * (bannerWeb-mf.js `InactivityTimer`), restarted by `ajaxStart` on the
 * document. Banner's code fires `ajaxStop` after it, which registration
 * pages wait on, so both are fired.
 */
const BANNER_ACTIVITY_EVENTS = ["ajaxStart", "ajaxStop"] as const;

/**
 * Restarts this page's idle-logout timer, as Banner's own "keep me signed
 * in" button does once the server has kept the session. DOM events reach the
 * page's own listeners from the content script's world.
 */
export function restartBannerPageTimer(): void {
  for (const type of BANNER_ACTIVITY_EVENTS) {
    document.dispatchEvent(new Event(type));
  }
}
