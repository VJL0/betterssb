import { useCallback, useEffect, useMemo, useState } from "react";
import {
  parseClassQuery,
  type ClassQuery,
} from "@workspace/shared/lib/class-query";
import type {
  ClassSearchFilters,
  ClassSearchResult,
} from "@workspace/shared/types/classes";
import { fetchSubjects, searchClasses } from "@/lib/api/classes";

/** Each search opens a Banner session, so wait for typing to pause. */
const TYPING_PAUSE_MS = 500;
export const PAGE_SIZE = 50;

// Subject codes per term, for telling "CIS" (a subject) from "data" (a keyword).
const subjectsByTerm = new Map<string, Promise<Set<string>>>();

function loadSubjects(term: string): Promise<Set<string>> {
  let request = subjectsByTerm.get(term);
  if (!request) {
    request = fetchSubjects(term)
      .then((subjects) => new Set(subjects.map((s) => s.code.toUpperCase())))
      .catch(() => {
        subjectsByTerm.delete(term);
        // Without the list every query searches by keyword, which still works.
        return new Set<string>();
      });
    subjectsByTerm.set(term, request);
  }
  return request;
}

function filtersFor(
  term: string,
  query: ClassQuery,
  offset: number,
): ClassSearchFilters | null {
  switch (query.kind) {
    case "course":
      return {
        term,
        subject: query.subject,
        courseNumber: query.courseNumber,
        offset,
        limit: PAGE_SIZE,
      };
    case "subject":
      return { term, subject: query.subject, offset, limit: PAGE_SIZE };
    case "keyword":
      return { term, keyword: query.keyword, offset, limit: PAGE_SIZE };
    default:
      return null;
  }
}

export type SearchStatus = "idle" | "loading" | "ready" | "error";

export interface ClassSearch {
  query: ClassQuery;
  status: SearchStatus;
  /** Every page loaded so far. Kept after a failed refresh, marked stale. */
  result: ClassSearchResult | null;
  stale: boolean;
  error: Error | null;
  loadingMore: boolean;
  loadMore: () => void;
  refresh: () => void;
}

interface SearchResponse {
  /** The filters and refresh it answers, so an old response never shows for a new query. */
  key: string;
  refresh: number;
  result: ClassSearchResult | null;
  error: Error | null;
}

const NO_RESPONSE: SearchResponse = {
  key: "",
  refresh: -1,
  result: null,
  error: null,
};

export function useClassSearch(
  term: string | null,
  input: string,
): ClassSearch {
  const [subjects, setSubjects] = useState<{
    term: string;
    codes: Set<string>;
  } | null>(null);
  const [settledInput, setSettledInput] = useState(input);
  const [response, setResponse] = useState<SearchResponse>(NO_RESPONSE);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshCount, setRefreshCount] = useState(0);

  useEffect(() => {
    if (!term) return;
    let cancelled = false;
    void loadSubjects(term).then((codes) => {
      if (!cancelled) setSubjects({ term, codes });
    });
    return () => {
      cancelled = true;
    };
  }, [term]);

  useEffect(() => {
    const timer = setTimeout(() => setSettledInput(input), TYPING_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [input]);

  const subjectsReady = subjects !== null && subjects.term === term;
  const query: ClassQuery = useMemo(
    () =>
      subjectsReady
        ? parseClassQuery(settledInput, subjects.codes)
        : { kind: "empty" },
    [settledInput, subjects, subjectsReady],
  );
  const filters = term ? filtersFor(term, query, 0) : null;
  const filtersKey = filters ? JSON.stringify(filters) : "";

  useEffect(() => {
    if (!filtersKey) return;
    const controller = new AbortController();
    const request = JSON.parse(filtersKey) as ClassSearchFilters;
    searchClasses(request, controller.signal).then(
      (result) =>
        setResponse({
          key: filtersKey,
          refresh: refreshCount,
          result,
          error: null,
        }),
      (err: unknown) => {
        if (controller.signal.aborted) return;
        setResponse((previous) => ({
          key: filtersKey,
          refresh: refreshCount,
          // Keep showing this query's last results, marked stale.
          result: previous.key === filtersKey ? previous.result : null,
          error: err instanceof Error ? err : new Error(String(err)),
        }));
      },
    );
    return () => controller.abort();
  }, [filtersKey, refreshCount]);

  const forThisQuery = response.key === filtersKey;
  const result = forThisQuery ? response.result : null;

  const loadMore = useCallback(() => {
    if (!term || !result || result.sections.length >= result.totalCount) return;
    const next = filtersFor(term, query, result.sections.length);
    if (!next) return;
    setLoadingMore(true);
    searchClasses(next).then(
      (page) => {
        setResponse((current) =>
          current.key === filtersKey && current.result
            ? {
                ...current,
                result: {
                  ...page,
                  sections: [...current.result.sections, ...page.sections],
                },
              }
            : current,
        );
        setLoadingMore(false);
      },
      (err: unknown) => {
        setResponse((current) => ({
          ...current,
          error: err instanceof Error ? err : new Error(String(err)),
        }));
        setLoadingMore(false);
      },
    );
  }, [term, result, query, filtersKey]);

  const refresh = useCallback(() => setRefreshCount((n) => n + 1), []);

  const typing =
    input.trim() !== settledInput.trim() && input.trim().length >= 2;
  const waiting =
    Boolean(term) &&
    (!subjectsReady ||
      typing ||
      (filtersKey !== "" &&
        (!forThisQuery || response.refresh !== refreshCount)));
  const status: SearchStatus = !term
    ? "idle"
    : waiting
      ? "loading"
      : !filtersKey
        ? "idle"
        : response.error
          ? "error"
          : "ready";

  return {
    query,
    status,
    result,
    stale: status === "error" && result !== null,
    error: forThisQuery ? response.error : null,
    loadingMore,
    loadMore,
    refresh,
  };
}
