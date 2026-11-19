/**
 * The `/ssb/userPreference/` reads. Both answer 200
 * `application/json;charset=UTF-8` with or without cookies. Banner's page
 * also POSTs `saveLocale` and `saveUsageTracking` here, which change the
 * student's settings and were not called.
 */

import type { Open } from "../common";

/**
 * `GET /ssb/userPreference/fetchUsageTracking` (the `usageTrackingURL` meta).
 * A guest always gets `{}` (sent as "{\n}"); Banner's page only asks when
 * signed in.
 */
export type UsageTrackingResponse = GuestUsageTracking | SignedInUsageTracking;

export type GuestUsageTracking = Record<string, never>;

/** From the user's HAR captures: the same 22 times. */
export interface SignedInUsageTracking {
  /** "Y" once the student accepted analytics cookies ("N" if declined). */
  isUsageTrackingEnabled: "Y";
  isEllucianTrackerAllowed: false;
  isTrackerIdAvailable: "Y";
}

/**
 * `GET /ssb/userPreference/locales`, the Tools menu's language picker
 * (hidden at Temple by `isLanguageSettingRequired`). The same 2,401 bytes for
 * every guest.
 */
export interface LocalesResponse {
  /** The 29 locales of `LocaleDescriptions`, sorted by code. */
  locales: Locale[];
  /** `en_US` for guests, from the `userLocale` meta. */
  selectedLocale: Locale;
}

export interface Locale {
  locale: LocaleCode;
  description: string;
}

/** Java-style codes: language, or language + "_" + region ("es_419"). */
export interface LocaleDescriptions {
  ar: "Arabic";
  ar_SA: "Arabic (Saudi Arabia)";
  cy_GB: "Welsh (United Kingdom)";
  de_DE: "German (Germany)";
  en_AU: "English (Australia)";
  en_GB: "English (United Kingdom)";
  en_IE: "English (Ireland)";
  en_IN: "English (India)";
  en_US: "English (United States)";
  es: "Spanish";
  es_419: "Spanish (Latin America)";
  es_AR: "Spanish (Argentina)";
  es_CL: "Spanish (Chile)";
  es_CO: "Spanish (Colombia)";
  es_CR: "Spanish (Costa Rica)";
  es_DO: "Spanish (Dominican Republic)";
  es_EC: "Spanish (Ecuador)";
  es_ES: "Spanish (Spain)";
  es_GT: "Spanish (Guatemala)";
  es_MX: "Spanish (Mexico)";
  es_PA: "Spanish (Panama)";
  es_PE: "Spanish (Peru)";
  es_PR: "Spanish (Puerto Rico)";
  es_VE: "Spanish (Venezuela)";
  fr: "French";
  fr_CA: "French (Canada)";
  fr_FR: "French (France)";
  pt: "Portuguese";
  pt_BR: "Portuguese (Brazil)";
}

export type LocaleCode = Open<keyof LocaleDescriptions>;
