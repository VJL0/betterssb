/**
 * Google sign-in, run entirely by the backend. The browser is sent to the
 * login endpoint, the backend finishes OAuth, sets an HttpOnly session cookie,
 * and redirects back here (with `?auth_error=` if it failed).
 */
import {
  ApiError,
  getMe,
  logout as endSession,
  type UserResponse,
} from "@workspace/api-client";

const UNAUTHORIZED = 401;

export type User = UserResponse;

/** A navigation, not a fetch call, so it isn't in the generated client. */
export const LOGIN_URL = "/api/auth/google/login";

const AUTH_ERRORS: Record<string, string> = {
  access_denied: "Sign-in was cancelled.",
  account_disabled: "This account has been disabled.",
  failed: "Sign-in failed. Please try again.",
};

/** The signed-in user, or null if there's no valid session. */
export async function fetchCurrentUser(): Promise<User | null> {
  try {
    const { data } = await getMe({
      meta: { errorMessage: "Couldn't check sign-in." },
    });
    return data;
  } catch (err) {
    if (err instanceof ApiError && err.status === UNAUTHORIZED) return null;
    throw err;
  }
}

export async function logout(): Promise<void> {
  await endSession({ meta: { errorMessage: "Sign-out failed." } });
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
