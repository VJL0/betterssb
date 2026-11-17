import { configureApiClient } from "@workspace/api-client";
import { API_ORIGIN } from "@/lib/config";
import { loggedFetch } from "@/lib/logged-fetch";

/**
 * Points the generated API client at the backend. Requests from the
 * extension are cross-origin, so they include credentials to send the
 * HttpOnly session cookie (see lib/auth.ts), and each one is logged for the
 * popup like every other request the extension sends. Call at the start of
 * each extension context that calls the API.
 */
export function setUpApiClient(): void {
  configureApiClient({
    origin: API_ORIGIN,
    credentials: "include",
    fetch: loggedFetch,
  });
}
