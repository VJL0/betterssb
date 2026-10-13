/**
 * Google sign-in, run entirely by the backend. The browser is sent to the
 * login endpoint, the backend finishes OAuth, sets an HttpOnly session cookie,
 * and redirects back here (with `?auth_error=` if it failed).
 */

/** Mirrors backend/app/modules/auth/schemas.py (camelCase over the wire). */
export interface User {
  id: string;
  email: string;
  name: string;
  pictureUrl: string;
}

export const LOGIN_URL = "/api/auth/google/login";

const AUTH_ERRORS: Record<string, string> = {
  access_denied: "Sign-in was cancelled.",
  account_disabled: "This account has been disabled.",
  failed: "Sign-in failed. Please try again.",
};

/** The signed-in user, or null if there's no valid session. */
export async function fetchCurrentUser(): Promise<User | null> {
  const res = await fetch("/api/auth/me");
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`Couldn't check sign-in (HTTP ${res.status}).`);
  return (await res.json()) as User;
}

export async function logout(): Promise<void> {
  const res = await fetch("/api/auth/logout", { method: "POST" });
  if (!res.ok) throw new Error(`Sign-out failed (HTTP ${res.status}).`);
}

/**
 * Reads the error the backend appended after a failed sign-in, and removes it
 * from the address bar so a reload doesn't show it again.
 */
export function takeAuthError(): string | null {
  const url = new URL(window.location.href);
  const code = url.searchParams.get("auth_error");
  if (code == null) return null;
  url.searchParams.delete("auth_error");
  window.history.replaceState(null, "", url);
  return AUTH_ERRORS[code] ?? AUTH_ERRORS.failed;
}
