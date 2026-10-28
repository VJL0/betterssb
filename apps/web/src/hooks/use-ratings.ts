import { useCallback, useMemo } from "react";
import { useQueries, type UseQueryResult } from "@tanstack/react-query";
import { ApiError, type RmpRating } from "@workspace/api-client";
import { searchProfessorsOptions } from "@workspace/api-client/query";
import {
  instructorSearchName,
  matchingProfile,
} from "@workspace/shared/lib/instructors";
import { TBA_INSTRUCTOR } from "@workspace/shared/lib/sections";

/** undefined while loading or unknown, null for no profile. */
export type RatingLookup = RmpRating | null | undefined;

/**
 * "syncing" while the API fetches Rate My Professors for the first time,
 * "unavailable" when that outlasted our retries.
 */
export type RatingsStatus = "ready" | "syncing" | "unavailable";

export interface Ratings {
  byName: ReadonlyMap<string, RatingLookup>;
  status: RatingsStatus;
  /** Asks again for the ratings that didn't load. */
  retry: () => void;
}

// The API answers 503 until its first roster sync, which takes about a
// minute, so those lookups keep asking for a while before giving up.
const ROSTER_SYNCING_STATUS = 503;
const SYNC_RETRY_DELAY_MS = 10_000;
const MAX_SYNC_RETRIES = 12;

type RatingResult = UseQueryResult<RmpRating | null, unknown>;

function isRosterSyncing(error: unknown): boolean {
  return error instanceof ApiError && error.status === ROSTER_SYNCING_STATUS;
}

/** Still asking while the API syncs, including a retry after giving up. */
function isWaitingOnSync(result: RatingResult): boolean {
  return (
    !result.isSuccess &&
    result.isFetching &&
    isRosterSyncing(result.failureReason ?? result.error)
  );
}

function gaveUpOnSync(result: RatingResult): boolean {
  return result.isError && !result.isFetching && isRosterSyncing(result.error);
}

function lookupOf(result: RatingResult | undefined): RatingLookup {
  if (!result?.isError) return result?.data;
  // A roster that never loaded says nothing about this instructor.
  return isRosterSyncing(result.error) ? undefined : null;
}

function statusOf(results: RatingResult[]): RatingsStatus {
  if (results.some(isWaitingOnSync)) return "syncing";
  if (results.some(gaveUpOnSync)) return "unavailable";
  return "ready";
}

function ratingQuery(name: string) {
  return {
    ...searchProfessorsOptions({
      query: { name: instructorSearchName(name) },
    }),
    select: (matches: RmpRating[]) => matchingProfile(name, matches),
    // One lookup per instructor for the life of the page.
    staleTime: Infinity,
    // Any other failed lookup shows as "no profile" now and is retried on reload.
    retry: (failureCount: number, error: unknown) =>
      isRosterSyncing(error) && failureCount < MAX_SYNC_RETRIES,
    retryDelay: SYNC_RETRY_DELAY_MS,
  };
}

/** Temple University ratings for Banner instructor names ("Last, First"). */
export function useRatings(names: readonly string[]): Ratings {
  // One string key, so the lookups only change when the set of names does.
  const key = [...new Set(names.filter((n) => n && n !== TBA_INSTRUCTOR))]
    .sort()
    .join("\n");
  const wanted = useMemo(() => (key ? key.split("\n") : []), [key]);

  const combine = useCallback(
    (results: RatingResult[]): Ratings => ({
      byName: new Map<string, RatingLookup>(
        wanted.map((name, i) => [name, lookupOf(results[i])]),
      ),
      status: statusOf(results),
      retry: () => {
        for (const result of results) {
          if (gaveUpOnSync(result)) void result.refetch();
        }
      },
    }),
    [wanted],
  );

  return useQueries({
    queries: wanted.map(ratingQuery),
    combine,
  });
}
