import { useCallback, useMemo } from "react";
import { useQueries, type UseQueryResult } from "@tanstack/react-query";
import type { RmpRating } from "@workspace/api-client";
import { searchProfessorsOptions } from "@workspace/api-client/query";
import { instructorSearchName } from "@workspace/shared/lib/instructors";
import { usableRating } from "@workspace/shared/lib/ratings";

/** Rate My Professors is a shared service; don't fire a whole page of lookups at once. */
const MAX_CONCURRENT_LOOKUPS = 4;

/** undefined while loading, null for no profile. */
export type RatingLookup = RmpRating | null | undefined;

let running = 0;
const waiting: (() => void)[] = [];

async function withSlot<T>(task: () => Promise<T>): Promise<T> {
  if (running >= MAX_CONCURRENT_LOOKUPS) {
    await new Promise<void>((resolve) => waiting.push(resolve));
  }
  running++;
  try {
    return await task();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

function bestMatch(matches: RmpRating[]): RmpRating | null {
  return usableRating(matches[0] ?? null);
}

function ratingQuery(name: string, schoolId: string) {
  const options = searchProfessorsOptions({
    query: { name: instructorSearchName(name), school_id: schoolId },
  });
  return {
    ...options,
    queryFn: (context: Parameters<NonNullable<typeof options.queryFn>>[0]) =>
      withSlot(async () => options.queryFn!(context)),
    select: bestMatch,
    // One lookup per instructor per school for the life of the page.
    staleTime: Infinity,
    // A failed lookup shows as "no profile" now and is retried on reload.
    retry: false,
  };
}

/**
 * Ratings for Banner instructor names ("Last, First"). Without a school
 * there's nothing to look up, so every name maps to undefined.
 */
export function useRatings(
  names: readonly string[],
  schoolId: string | null,
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
    queries: schoolId ? wanted.map((name) => ratingQuery(name, schoolId)) : [],
    combine,
  });
}
