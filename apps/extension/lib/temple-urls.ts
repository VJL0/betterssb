/**
 * Temple University's Banner, DARS and TUportal, the only sites the extension reaches.
 * Plain constants, so wxt.config.ts can read them at build time too.
 */

export const BANNER_ORIGIN = "https://prd-xereg.temple.edu";
/** Banner's registration pages: the content script, host permission and tab lookups. */
export const BANNER_PAGES = `${BANNER_ORIGIN}/StudentRegistrationSsb/*`;
/** Where students sign in to Banner registration. */
export const BANNER_REGISTRATION_URL = `${BANNER_ORIGIN}/StudentRegistrationSsb/ssb/registration`;

export const DARS_ORIGIN = "https://prd-dars.temple.edu";
export const DARS_PAGES = `${DARS_ORIGIN}/selfservice/*`;
export const DARS_START_URL = `${DARS_ORIGIN}/selfservice/audit/create.html`;

export const TUPORTAL_ORIGIN = "https://tuportal6.temple.edu";
export const TUPORTAL_PAGES = `${TUPORTAL_ORIGIN}/*`;
/** TUportal's priority registration countdown: the student's registration time per term. */
export const PRIORITY_REGISTRATION_URL = `${TUPORTAL_ORIGIN}/html/TEMPLE/apps/tup/Countdown/PriorityRegistration/PriorityRegistration.jsp`;

/** Whether `url` is one of Banner's registration pages, as `BANNER_PAGES` matches them. */
export function isBannerPage(url: string): boolean {
  return url.startsWith(`${BANNER_ORIGIN}/StudentRegistrationSsb/`);
}
