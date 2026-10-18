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

interface Settled<T> {
  query: string;
  results: T[];
  hasError: boolean;
}

/**
 * Runs `fetchResults` for `query` once typing pauses. A response that arrives
 * after a newer query started is dropped, so results always match the input.
 * While a newer search runs, the previous results stay visible.
 * `fetchResults` should be stable (module-level or memoized).
 */
export function useDebouncedSearch<T>(
  query: string,
  fetchResults: (query: string) => Promise<T[]>,
  {
    minQueryLength = DEFAULT_MIN_QUERY_LENGTH,
    debounceMs = DEFAULT_DEBOUNCE_MS,
  }: DebouncedSearchOptions = {},
): DebouncedSearchResult<T> {
  const text = query.trim();
  const tooShort = text.length < minQueryLength;
  const [settled, setSettled] = useState<Settled<T>>({
    query: "",
    results: [],
    hasError: false,
  });

  useEffect(() => {
    if (tooShort) return;
    let isStale = false;
    const timer = setTimeout(async () => {
      try {
        const results = await fetchResults(text);
        if (!isStale) setSettled({ query: text, results, hasError: false });
      } catch {
        if (!isStale) setSettled({ query: text, results: [], hasError: true });
      }
    }, debounceMs);
    return () => {
      isStale = true;
      clearTimeout(timer);
    };
  }, [text, tooShort, fetchResults, debounceMs]);

  if (tooShort) return { results: [], isLoading: false, hasError: false };
  const isLoading = settled.query !== text;
  return {
    results: settled.results,
    isLoading,
    hasError: !isLoading && settled.hasError,
  };
}
