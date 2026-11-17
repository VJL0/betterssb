/**
 * The student's Banner session, checked from the background script. The
 * extension's host permission lets these requests carry the student's Banner
 * cookies, so no Banner tab needs to be open.
 *
 * Banner has no "who am I" endpoint, and a JSESSIONID alone proves nothing:
 * guest pages answer 200, and right after the CAS ticket exchange the session
 * exists without any user on it. The self-service menu is the read-only check
 * that tells them apart (docs/ssb-login-system.md, "Probe B"): it lists the
 * student's menu entries when signed in and is empty for a guest. Like any
 * Banner request, it also restarts the session's idle window, so checking
 * keeps the student signed in.
 */
import { BANNER_ORIGIN } from "@/lib/temple-urls";

const SSB_BASE = `${BANNER_ORIGIN}/StudentRegistrationSsb/ssb`;
export const BANNER_MENU_URL = `${SSB_BASE}/selfServiceMenu/data`;

/** The last Banner connection the background saw; a change tells the popup and website. */
export const BANNER_CONNECTION_KEY = "betterssb:bannerConnection";

/** One menu entry; a guest's menu is a bare `<NavigationEntries />`. */
const MENU_ENTRY = /<NavigationEntryValueObject\b/;

/** HTTP statuses Banner answers with when the session has no signed-in user. */
const SIGNED_OUT_STATUSES: ReadonlySet<number> = new Set([401, 403]);

/** With the student's cookies, and without following Banner's redirect to sign-in. */
const BANNER_REQUEST: RequestInit = {
  credentials: "include",
  redirect: "manual",
  cache: "no-store",
};

function isSignedOutAnswer(res: Response): boolean {
  return res.type === "opaqueredirect" || SIGNED_OUT_STATUSES.has(res.status);
}

/** Whether a self-service menu response lists a signed-in student's entries. */
export function menuIsSignedIn(xml: string): boolean {
  return MENU_ENTRY.test(xml);
}

/**
 * Asks Banner whether this browser's session has a signed-in student.
 * Rejects when Banner can't be reached or fails, which says nothing either way.
 */
export async function isSignedInToBanner(): Promise<boolean> {
  const res = await fetch(BANNER_MENU_URL, BANNER_REQUEST);
  if (isSignedOutAnswer(res)) return false;
  if (!res.ok) throw new Error(`Banner returned HTTP ${res.status}`);
  return menuIsSignedIn(await res.text());
}
