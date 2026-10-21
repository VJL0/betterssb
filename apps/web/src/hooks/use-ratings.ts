import { useCallback, useMemo } from "react";
import { useQueries, type UseQueryResult } from "@tanstack/react-query";
import { ApiError, type RmpRating } from "@workspace/api-client";
import { searchProfessorsOptions } from "@workspace/api-client/query";
import {
  instructorSearchName,
  matchingProfile,
} from "@workspace/shared/lib/instructors";
import { usableRating } from "@workspace/shared/lib/ratings";

/** undefined while loading, null for no profile. */
export type RatingLookup = RmpRating | null | undefined;

export interface Ratings {
  byName: ReadonlyMap<string, RatingLookup>;
  /** The API is fetching Rate My Professors for the first time. */
  syncing: boolean;
}

// The API answers 503 until its first roster sync, which takes about a
// minute, so those lookups keep asking for a while before showing "No RMP".
const ROSTER_SYNCING_STATUS = 503;
const SYNC_RETRY_DELAY_MS = 10_000;
const MAX_SYNC_RETRIES = 12;

function isRosterSyncing(error: unknown): boolean {
  return error instanceof ApiError && error.status === ROSTER_SYNCING_STATUS;
}

function ratingQuery(name: string) {
  return {
    ...searchProfessorsOptions({
      query: { name: instructorSearchName(name) },
    }),
    select: (matches: RmpRating[]) =>
      usableRating(matchingProfile(name, matches)),
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
  const key = [...new Set(names.filter((n) => n && n !== "TBA"))]
    .sort()
    .join("\n");
  const wanted = useMemo(() => (key ? key.split("\n") : []), [key]);

  const combine = useCallback(
    (results: UseQueryResult<RmpRating | null, unknown>[]): Ratings => ({
      byName: new Map<string, RatingLookup>(
        wanted.map((name, i) => {
          const result = results[i];
          return [name, result?.isError ? null : result?.data];
        }),
      ),
      syncing: results.some(
        (result) => result.isPending && isRosterSyncing(result.failureReason),
      ),
    }),
    [wanted],
  );

  return useQueries({
    queries: wanted.map(ratingQuery),
    combine,
  });
}
