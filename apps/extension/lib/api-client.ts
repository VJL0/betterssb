import { configureApiClient } from "@workspace/api-client";
import { API_ORIGIN } from "@/lib/config";
import { loggedFetch } from "@/lib/logged-fetch";

/**
 * Points the API client at the backend, sending the session cookie
 * cross-origin and logging each request for the popup. Call once in each
 * extension context that uses the API.
 */
export function setUpApiClient(): void {
  configureApiClient({
    origin: API_ORIGIN,
    credentials: "include",
    fetch: loggedFetch,
  });
}
