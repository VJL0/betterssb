import {
  ApiError,
  getMe,
  logout as endSession,
  type UserResponse,
} from "@workspace/api-client";
import { API_ORIGIN } from "@/lib/config";

const UNAUTHORIZED = 401;

/**
 * Sign-in runs entirely on the backend (Google OAuth code flow). The backend
 * sets an HttpOnly session cookie on the API host; the extension's host
 * permission for that host lets its requests send the cookie, so the
 * extension never sees a token. The web app shares the same session.
 */
export const LOGIN_URL = `${API_ORIGIN}/api/auth/google/login`;

/** Opens the backend's Google sign-in in a new tab. */
export async function startLogin(): Promise<void> {
  await browser.tabs.create({ url: LOGIN_URL, active: true });
}

/** The signed-in user, or null if there's no valid session. */
export async function fetchCurrentUser(): Promise<UserResponse | null> {
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
