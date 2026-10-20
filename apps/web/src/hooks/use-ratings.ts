import { useCallback, useMemo } from "react";
import { useQueries, type UseQueryResult } from "@tanstack/react-query";
import type { RmpRating } from "@workspace/api-client";
import { searchProfessorsOptions } from "@workspace/api-client/query";
import {
  instructorSearchName,
  matchingProfile,
} from "@workspace/shared/lib/instructors";
import { usableRating } from "@workspace/shared/lib/ratings";

/** undefined while loading, null for no profile. */
export type RatingLookup = RmpRating | null | undefined;

function ratingQuery(name: string) {
  return {
    ...searchProfessorsOptions({
      query: { name: instructorSearchName(name) },
    }),
    select: (matches: RmpRating[]) =>
      usableRating(matchingProfile(name, matches)),
    // One lookup per instructor for the life of the page.
    staleTime: Infinity,
    // A failed lookup shows as "no profile" now and is retried on reload.
    retry: false,
  };
}

/** Temple University ratings for Banner instructor names ("Last, First"). */
export function useRatings(
  names: readonly string[],
): Map<string, RatingLookup> {
  // One string key, so the lookups only change when the set of names does.
  const key = [...new Set(names.filter((n) => n && n !== "TBA"))]
    .sort()
    .join("\n");
  const wanted = useMemo(() => (key ? key.split("\n") : []), [key]);

  const combine = useCallback(
    (results: UseQueryResult<RmpRating | null, unknown>[]) =>
      new Map<string, RatingLookup>(
        wanted.map((name, i) => {
          const result = results[i];
          return [name, result?.isError ? null : result?.data];
        }),
      ),
    [wanted],
  );

  return useQueries({
    queries: wanted.map(ratingQuery),
    combine,
  });
}
