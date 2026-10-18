/**
 * Calls the BetterSSB API, same-origin at /api (Vite proxies it in development).
 * Errors are RFC 9457 problem details; `detail` is safe to show students.
 */

const API_BASE = "/api";

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** Thrown when the request never got an HTTP response (offline, server down). */
export class NetworkError extends Error {
  constructor() {
    super("Couldn't reach BetterSSB. Check your connection and try again.");
    this.name = "NetworkError";
  }
}

interface ProblemDetails {
  title?: unknown;
  detail?: unknown;
}

async function problemMessage(
  res: Response,
  fallback: string,
): Promise<string> {
  const body = (await res.json().catch(() => null)) as ProblemDetails | null;
  if (typeof body?.detail === "string") return body.detail;
  return fallback;
}

export interface RequestOptions extends RequestInit {
  /** Shown when the API gives no `detail`. */
  errorMessage?: string;
  query?: Record<string, string | number | undefined>;
}

function withQuery(path: string, query: RequestOptions["query"]): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(name, String(value));
  }
  const search = params.toString();
  return search ? `${path}?${search}` : path;
}

export async function requestJson<T>(
  path: string,
  { errorMessage, query, ...init }: RequestOptions = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${withQuery(path, query)}`, init);
  } catch (err) {
    // Compared by name: an abort can come from another realm's DOMException.
    if ((err as { name?: unknown } | null)?.name === "AbortError") throw err;
    throw new NetworkError();
  }
  if (!res.ok) {
    throw new ApiError(
      res.status,
      await problemMessage(
        res,
        errorMessage ?? `Something went wrong (HTTP ${res.status}).`,
      ),
    );
  }
  return (await res.json()) as T;
}

export function postJson<T>(
  path: string,
  body: unknown,
  options: RequestOptions = {},
): Promise<T> {
  return requestJson<T>(path, {
    ...options,
    method: "POST",
    headers: { "Content-Type": "application/json", ...options.headers },
    body: JSON.stringify(body),
  });
}
