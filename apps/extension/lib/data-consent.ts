import { getStorageItem, setStorageItem } from "./storage";

/**
 * The student's agreement to the popup's data disclosure, which the Chrome
 * Web Store's User Data Policy requires in the extension's own UI before any
 * user data is handled. Until it's given, the background answers nothing that
 * uses a Temple sign-in or the BetterSSB API, and the Banner overlay stays off.
 */
export const DATA_CONSENT_KEY = "betterssb:dataConsent";

export const DATA_CONSENT_REQUIRED =
  "Open the BetterSSB extension and agree to how it uses your data first.";

export async function hasDataConsent(): Promise<boolean> {
  return typeof (await getStorageItem(DATA_CONSENT_KEY)) === "string";
}

/** Records when the student agreed. */
export async function giveDataConsent(): Promise<void> {
  await setStorageItem(DATA_CONSENT_KEY, new Date().toISOString());
}
