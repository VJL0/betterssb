import { loggedFetch } from "@/lib/logged-fetch";

/** HTTP statuses Temple's apps answer with when the session has no signed-in student. */
const SIGNED_OUT_STATUSES: ReadonlySet<number> = new Set([401, 403]);

/**
 * A request to Banner, Banner Self-Service or DARS with the student's
 * cookies, which the extension's host permissions send. A signed-out session
 * redirects to Temple's sign-in at fim.temple.edu, which isn't followed: the
 * extension has no permission there.
 */
export function signedInFetch(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  return loggedFetch(url, {
    credentials: "include",
    redirect: "manual",
    cache: "no-store",
    ...init,
  });
}

/** Whether the answer is the one a session without a signed-in student gets. */
export function isSignedOutAnswer(res: Response): boolean {
  return res.type === "opaqueredirect" || SIGNED_OUT_STATUSES.has(res.status);
}
