import { useEffect, useState } from "react";

export const DEFAULT_MIN_QUERY_LENGTH = 2;
const DEFAULT_DEBOUNCE_MS = 300;

interface DebouncedSearchOptions {
  /** Queries shorter than this (after trimming) don't search. */
  minQueryLength?: number;
  debounceMs?: number;
}

interface DebouncedSearchResult<T> {
  results: T[];
  isLoading: boolean;
  hasError: boolean;
}

/**
 * Runs `fetchResults` for `query` once typing pauses. A response that arrives
 * after a newer query started is dropped, so results always match the input.
 * `fetchResults` should be stable (wrap it in useCallback).
 */
export function useDebouncedSearch<T>(
  query: string,
  fetchResults: (query: string) => Promise<T[]>,
  {
    minQueryLength = DEFAULT_MIN_QUERY_LENGTH,
    debounceMs = DEFAULT_DEBOUNCE_MS,
  }: DebouncedSearchOptions = {},
): DebouncedSearchResult<T> {
  const [results, setResults] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const text = query.trim();
    let isStale = false;

    if (text.length < minQueryLength) {
      setResults([]);
      setIsLoading(false);
      setHasError(false);
      return;
    }

    setIsLoading(true);
    const timer = setTimeout(async () => {
      try {
        const found = await fetchResults(text);
        if (isStale) return;
        setResults(found);
        setHasError(false);
      } catch {
        if (isStale) return;
        setResults([]);
        setHasError(true);
      } finally {
        if (!isStale) setIsLoading(false);
      }
    }, debounceMs);

    return () => {
      isStale = true;
      clearTimeout(timer);
    };
  }, [query, fetchResults, minQueryLength, debounceMs]);

  return { results, isLoading, hasError };
}
