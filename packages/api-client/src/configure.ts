import type { ClientMeta } from "./generated/client";
import { client } from "./generated/client.gen";
import { toApiError } from "./errors";

export interface ApiClientOptions {
  /**
   * The API's origin, e.g. "https://api.example.edu". Empty for the web app,
   * which reaches the API same-origin at /api.
   */
  origin?: string;
  /**
   * "include" for the extension, whose requests to the API host are
   * cross-origin and must still send the HttpOnly session cookie.
   */
  credentials?: RequestCredentials;
}

let errorInterceptor: number | null = null;

/**
 * SDK functions pass `meta` through to the client untouched, but the client's
 * own option types don't declare it.
 */
function errorMessageOf(options: object): string | undefined {
  return (options as { meta?: ClientMeta }).meta?.errorMessage;
}

/**
 * Points the shared generated client at the API and installs error handling.
 * Call once at startup, before any request; calling again replaces the
 * settings rather than stacking interceptors.
 */
export function configureApiClient({
  origin = "",
  credentials = "same-origin",
}: ApiClientOptions = {}): void {
  client.setConfig({ baseUrl: origin.replace(/\/+$/, ""), credentials });
  if (errorInterceptor === null) {
    errorInterceptor = client.interceptors.error.use(
      (error, response, request, options) =>
        toApiError(error, request, response, errorMessageOf(options)),
    );
  }
}
