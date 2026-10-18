import { API_URL } from "@/lib/config";
import type { AuthUser } from "@workspace/shared/types";

/**
 * Sign-in runs entirely on the backend (Google OAuth code flow). The backend
 * sets an HttpOnly session cookie on the API host; the extension's host
 * permission for that host lets its requests send the cookie, so the
 * extension never sees a token. The web app shares the same session.
 */
export const LOGIN_URL = `${API_URL}/auth/google/login`;

/** Opens the backend's Google sign-in in a new tab. */
export async function startLogin(): Promise<void> {
  await browser.tabs.create({ url: LOGIN_URL, active: true });
}

/** The signed-in user, or null if there's no valid session. */
export async function fetchCurrentUser(): Promise<AuthUser | null> {
  const res = await fetch(`${API_URL}/auth/me`, { credentials: "include" });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`Couldn't check sign-in (HTTP ${res.status})`);
  return (await res.json()) as AuthUser;
}

export async function logout(): Promise<void> {
  const res = await fetch(`${API_URL}/auth/logout`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw new Error(`Sign-out failed (HTTP ${res.status})`);
}
