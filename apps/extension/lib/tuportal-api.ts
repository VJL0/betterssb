/**
 * Looks up the student's registration time in TUportal's priority
 * registration countdown, from the background script.
 *
 * The extension's host permission lets the request carry the student's
 * existing TUportal session cookie; the extension never reads, stores, or
 * forwards any credential.
 */
import { parsePriorityRegistration } from "@workspace/shared/lib/registration-time";
import type { RegistrationTimeLookup } from "@workspace/shared/types/auto-reg";
import { PRIORITY_REGISTRATION_URL, TUPORTAL_ORIGIN } from "@/lib/temple-urls";

/**
 * A signed-out TUportal redirects to its login (or Temple's SSO host) and
 * answers with an HTML page instead of the countdown's JSON.
 */
function isLoginPage(res: Response, body: string): boolean {
  return (
    !res.url.startsWith(TUPORTAL_ORIGIN) ||
    /\/(login|saml|idp)\b/i.test(res.url) ||
    body.trimStart().startsWith("<")
  );
}

/** The registration time TUportal lists for `term`. */
export async function lookUpRegistrationTime(
  term: string,
): Promise<RegistrationTimeLookup> {
  const res = await fetch(PRIORITY_REGISTRATION_URL, {
    credentials: "include",
  });
  if (!res.ok) throw new Error(`TUportal returned HTTP ${res.status}`);
  const body = await res.text();
  if (isLoginPage(res, body)) return { status: "signed-out" };

  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    throw new Error("Couldn't read TUportal's registration time.");
  }
  const time = parsePriorityRegistration(json).find((t) => t.term === term);
  return time
    ? { status: "found", startsAt: time.startsAt }
    : { status: "not-listed" };
}
