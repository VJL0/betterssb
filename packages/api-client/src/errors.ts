import type { Problem } from "./generated/types.gen";

declare module "./generated/core/types.gen" {
  interface ClientMeta {
    /** Shown when the API's problem has no `detail`, e.g. "Couldn't load terms." */
    errorMessage?: string;
  }
}

/** An HTTP error from the API. `message` is safe to show students. */
export class ApiError extends Error {
  readonly status: number;
  /** The RFC 9457 body, when the API sent one. */
  readonly problem: Problem | null;

  constructor(status: number, message: string, problem: Problem | null = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.problem = problem;
  }
}

/** The request never got an HTTP response (offline, server down). */
export class NetworkError extends Error {
  constructor() {
    super("Couldn't reach BetterSSB. Check your connection and try again.");
    this.name = "NetworkError";
  }
}

/** Compared by name: an abort can come from another realm's DOMException. */
export function isAbortError(error: unknown): boolean {
  return (error as { name?: unknown } | null)?.name === "AbortError";
}

function isProblem(value: unknown): value is Problem {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Problem).status === "number" &&
    typeof (value as Problem).title === "string"
  );
}

/**
 * Turns what the generated client throws (a parsed error body, the raw text,
 * or fetch's own TypeError) into an ApiError or NetworkError. Aborts and
 * errors building the request pass through unchanged, so a cancel or a bug
 * isn't shown as a server or connection problem.
 */
export function toApiError(
  error: unknown,
  request: Request | undefined,
  response: Response | undefined,
  fallbackMessage: string | undefined,
): unknown {
  if (isAbortError(error) || error instanceof ApiError) return error;
  // No request means building it failed: a bug, not the network.
  if (!request) return error;
  if (!response) return new NetworkError();
  const problem = isProblem(error) ? error : null;
  const message =
    problem?.detail ??
    fallbackMessage ??
    `Something went wrong (HTTP ${response.status}).`;
  return new ApiError(response.status, message, problem);
}

/**
 * A query or mutation error as an Error with a message to show. TanStack
 * types it as the API's Problem body, but the client configured by
 * configureApiClient throws ApiError or NetworkError instead.
 */
export function queryError(error: unknown): Error | null {
  if (error == null) return null;
  if (error instanceof Error) return error;
  if (isProblem(error)) {
    return new ApiError(error.status, error.detail ?? error.title, error);
  }
  return new Error(String(error));
}
