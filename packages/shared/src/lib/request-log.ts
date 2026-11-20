import type { RequestLog, RequestLogEntry } from "../types/store";

/** The most entries kept, so the log can't grow chrome.storage without end. */
export const REQUEST_LOG_LIMIT = 500;

/**
 * The same request again within this long of the last one counts toward that
 * entry instead of adding one, so a sign-in check every minute is one row.
 */
const REQUEST_LOG_FOLD_MS = 5 * 60 * 1000;

/**
 * Banner's cache buster and per-session id, which differ on every request and
 * say nothing, and DARS's `crossApp`, which carries the student's id.
 */
const NOISE_PARAMS = ["_", "uniqueSessionId", "crossApp"];

/** `url` without the parameters that change on every request or name the student. */
export function loggableUrl(url: string): string {
  const parsed = new URL(url);
  for (const name of NOISE_PARAMS) parsed.searchParams.delete(name);
  return parsed.href;
}

export type LoggedRequest = Pick<RequestLogEntry, "method" | "url" | "status">;

function repeats(
  latest: RequestLogEntry | undefined,
  request: LoggedRequest,
  at: string,
): latest is RequestLogEntry {
  return (
    latest !== undefined &&
    latest.method === request.method &&
    latest.url === request.url &&
    latest.status === request.status &&
    new Date(at).getTime() - new Date(latest.at).getTime() <=
      REQUEST_LOG_FOLD_MS
  );
}

/** The log with `request` added at `at`, counted into the latest entry when it repeats it. */
export function addRequest(
  log: RequestLog | null,
  request: LoggedRequest,
  at: string,
): RequestLog {
  const entries = log?.entries ?? [];
  const [latest, ...older] = entries;
  const next = repeats(latest, request, at)
    ? [{ ...latest, count: (latest.count ?? 1) + 1, at }, ...older]
    : [{ ...request, at }, ...entries];
  return { entries: next.slice(0, REQUEST_LOG_LIMIT), updatedAt: at };
}
