/**
 * Build-time settings from the environment (`.env`, `.env.production`).
 * Anything unset hides the UI that depends on it rather than linking nowhere.
 */

/** Where students sign in to Banner registration. Defaults to Temple's. */
export const BANNER_REGISTRATION_URL: string =
  process.env.NEXT_PUBLIC_BANNER_REGISTRATION_URL ||
  "https://prd-xereg.temple.edu/StudentRegistrationSsb/ssb/registration";

/** The extension's store listing. Unset until the extension is published. */
export const EXTENSION_INSTALL_URL: string | null =
  process.env.NEXT_PUBLIC_EXTENSION_INSTALL_URL || null;

/**
 * The site's public origin, for canonical links, the sitemap and social
 * cards. Server-only: it isn't `NEXT_PUBLIC_`, so the browser never sees it.
 */
export const SITE_URL: string = process.env.SITE_URL || "http://localhost:3000";

export const SITE_NAME = "BetterSSB";

export const SITE_DESCRIPTION =
  "Search every section with instructor ratings and seats, build conflict-free schedules, map your path to graduation, and register the second your window opens. Free for students using Banner Self-Service.";

export const SOURCE_CODE_URL = "https://github.com/VJL0/betterssb";
