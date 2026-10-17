import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "@workspace/api-client";

/** One retry covers a blip without holding an error back for long. */
const MAX_RETRIES = 1;
/** Banner data changes slowly; seats refresh on request ("Updated N ago"). */
const DEFAULT_STALE_MS = 60_000;

/** Bad input or a missing resource won't fix itself; server and network errors might. */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status < 500) return false;
  return failureCount < MAX_RETRIES;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetry,
        staleTime: DEFAULT_STALE_MS,
        // Each refetch is a Banner session; refresh is explicit instead.
        refetchOnWindowFocus: false,
      },
      mutations: { retry: false },
    },
  });
}
