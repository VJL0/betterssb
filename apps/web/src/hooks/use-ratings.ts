import { useEffect, useState } from "react";
import { instructorSearchName } from "@workspace/shared/lib/instructors";
import { usableRating } from "@workspace/shared/lib/ratings";
import type { RMPRating } from "@workspace/shared/types";
import { fetchRating } from "@/lib/api/rmp";

/** Rate My Professors is a shared service; don't fire a whole page of lookups at once. */
const MAX_CONCURRENT_LOOKUPS = 4;

/** undefined while loading, null for no profile. */
export type RatingLookup = RMPRating | null | undefined;

// One lookup per instructor per school for the life of the page.
const cache = new Map<string, Promise<RMPRating | null>>();
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

function lookup(name: string, schoolId: string): Promise<RMPRating | null> {
  const key = `${schoolId}|${name}`;
  let request = cache.get(key);
  if (!request) {
    request = withSlot(() => fetchRating(instructorSearchName(name), schoolId))
      .then(usableRating)
      .catch(() => {
        // A failed lookup shows as "no profile" now and is retried next page load.
        cache.delete(key);
        return null;
      });
    cache.set(key, request);
  }
  return request;
}

/**
 * Ratings for Banner instructor names ("Last, First"). Without a school
 * there's nothing to look up, so every name maps to undefined.
 */
export function useRatings(
  names: readonly string[],
  schoolId: string | null,
): Map<string, RatingLookup> {
  const [ratings, setRatings] = useState<Map<string, RMPRating | null>>(
    () => new Map(),
  );
  const wanted = [...new Set(names.filter((n) => n && n !== "TBA"))]
    .sort()
    .join("\n");

  useEffect(() => {
    if (!schoolId || !wanted) return;
    let cancelled = false;
    for (const name of wanted.split("\n")) {
      void lookup(name, schoolId).then((rating) => {
        if (cancelled) return;
        setRatings((current) => {
          if (current.get(name) === rating) return current;
          const next = new Map(current);
          next.set(name, rating);
          return next;
        });
      });
    }
    return () => {
      cancelled = true;
    };
  }, [wanted, schoolId]);

  return ratings;
}
