import { QueryClient } from "@tanstack/react-query";

/** Seats and ratings stay fresh enough for the life of one popup. */
const POPUP_STALE_MS = 60_000;
/** One retry covers a blip without holding an error back for long. */
const MAX_RETRIES = 1;

export function createPopupQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: POPUP_STALE_MS,
        retry: MAX_RETRIES,
        refetchOnWindowFocus: false,
      },
    },
  });
}
