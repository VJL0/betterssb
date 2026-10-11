import { useState, useEffect } from "react";
import type { RMPRating } from "@/types";
import { getCachedRatings, cacheRating } from "@/lib/storage";
import { sendMessage } from "@/lib/messaging";

interface UseRatingResult {
  rating: RMPRating | null;
  loading: boolean;
  error: string | null;
}

export function useRating(
  professorName: string,
  schoolName: string,
): UseRatingResult {
  const [rating, setRating] = useState<RMPRating | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!professorName) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const cached = await getCachedRatings();
        const key = professorName.toLowerCase();

        if (cached[key]) {
          if (!cancelled) {
            setRating(cached[key]);
            setLoading(false);
          }
          return;
        }

        const response = await sendMessage({
          type: "FETCH_RATING",
          payload: { name: professorName, school: schoolName },
        });

        if (!cancelled) {
          if (response.success && response.data) {
            const fetched = response.data as RMPRating;
            setRating(fetched);
            await cacheRating(professorName, fetched);
          } else {
            setError(response.error ?? "Failed to fetch rating");
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unknown error");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [professorName, schoolName]);

  return { rating, loading, error };
}
