/**
 * Build-time configuration, baked in from `.env` files (see `.env.example`).
 * Use `.env.development` / `.env.production` for per-mode values.
 */

/** The backend's origin. Generated API paths already start with /api. */
export const API_ORIGIN: string = (
  import.meta.env.WXT_API_ORIGIN || "http://localhost:8000"
).replace(/\/+$/, "");

/** The BetterSSB website, where the popup sends deeper tasks. */
export const WEB_ORIGIN: string = (
  import.meta.env.WXT_WEB_ORIGIN || "http://localhost:3000"
).replace(/\/+$/, "");

/** Where students sign in to Temple's Banner registration. */
export const BANNER_REGISTRATION_URL =
  "https://prd-xereg.temple.edu/StudentRegistrationSsb/ssb/registration";
