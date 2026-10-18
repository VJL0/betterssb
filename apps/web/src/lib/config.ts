/**
 * Build-time settings from Vite env (`.env`, `.env.production`).
 * Anything unset hides the UI that depends on it rather than linking nowhere.
 */

/** Where students sign in to Banner registration. Defaults to Temple's. */
export const BANNER_REGISTRATION_URL: string =
  import.meta.env.VITE_BANNER_REGISTRATION_URL ||
  "https://prd-xereg.temple.edu/StudentRegistrationSsb/ssb/registration";

/** The extension's store listing. Unset until the extension is published. */
export const EXTENSION_INSTALL_URL: string | null =
  import.meta.env.VITE_EXTENSION_INSTALL_URL || null;

export const SOURCE_CODE_URL = "https://github.com/VJL0/betterssb";
