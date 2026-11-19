import { useEffect, useState } from "react";
import {
  useInfiniteQuery,
  useQuery,
  type InfiniteData,
} from "@tanstack/react-query";
import {
  queryError,
  type SectionPage,
  type SubjectList,
  type SearchSectionsData,
} from "@workspace/api-client";
import {
  listSubjectsOptions,
  searchSectionsInfiniteOptions,
} from "@workspace/api-client/query";
import {
  parseClassQuery,
  type ClassQuery,
} from "@workspace/shared/lib/class-query";
import {
  bannerQuery,
  canSearchWithoutText,
  type BannerFilters,
} from "./banner-filters";

/** Each search opens a Banner session, so wait for typing to pause. */
const TYPING_PAUSE_MS = 500;
export const PAGE_SIZE = 50;
/** Subjects change between terms, not within one. */
const SUBJECTS_STALE_MS = 24 * 60 * 60 * 1000;
const NO_SUBJECTS = new Set<string>();

type SearchQuery = NonNullable<SearchSectionsData["query"]>;

function filtersFor(
  query: ClassQuery,
  filters: BannerFilters,
): SearchQuery | null {
  const narrowing = { ...bannerQuery(filters), limit: PAGE_SIZE };
  switch (query.kind) {
    case "course":
      return {
        ...narrowing,
        subject: query.subject,
        courseNumber: query.courseNumber,
      };
    case "subject":
      return { ...narrowing, subject: query.subject };
    case "keyword":
      return { ...narrowing, keyword: query.keyword };
    case "empty":
      return canSearchWithoutText(filters) ? narrowing : null;
    default:
      return null;
  }
}

function subjectCodes({ subjects }: SubjectList): Set<string> {
  return new Set(subjects.map((s) => s.code.toUpperCase()));
}

/** Every page loaded so far, as one. */
export type SearchResult = Omit<SectionPage, "nextCursor">;

/** Every page so far as one result. Seats are as fresh as the first page. */
function mergePages(data: InfiniteData<SectionPage>): SearchResult {
  const first = data.pages[0]!;
  return {
    totalCount: data.pages.at(-1)!.totalCount,
    fetchedAt: first.fetchedAt,
    sections: data.pages.flatMap((page) => page.sections),
  };
}

export type SearchStatus = "idle" | "loading" | "ready" | "error";

export interface ClassSearch {
  query: ClassQuery;
  status: SearchStatus;
  /** Every page loaded so far. Kept after a failed refresh, marked stale. */
  result: SearchResult | null;
  stale: boolean;
  error: Error | null;
  /** A page the cursor says is still to come. */
  hasMore: boolean;
  loadingMore: boolean;
  loadMore: () => void;
  refresh: () => void;
}

function useSettledInput(input: string): string {
  const [settled, setSettled] = useState(input);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(input), TYPING_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [input]);
  return settled;
}

function isTyping(text: string, settled: string): boolean {
  return text.trim() !== settled.trim() && text.trim().length >= 2;
}

/**
 * Banner's class search for what the student typed: a course ("CIS 2168"),
 * a subject ("CIS") or a keyword, narrowed by `bannerFilters`. An attribute
 * or instructor filter searches on its own. Pages load 50 sections at a time.
 */
export function useClassSearch(
  term: string | null,
  input: string,
  bannerFilters: BannerFilters,
): ClassSearch {
  const settledInput = useSettledInput(input);
  const settledInstructor = useSettledInput(bannerFilters.instructor);
  const subjects = useQuery({
    ...listSubjectsOptions({ path: { term: term ?? "" } }),
    enabled: term !== null,
    staleTime: SUBJECTS_STALE_MS,
    select: subjectCodes,
  });
  // Without the list every query searches by keyword, which still works.
  const subjectsSettled = subjects.isSuccess || subjects.isError;

  const query: ClassQuery = subjectsSettled
    ? parseClassQuery(settledInput, subjects.data ?? NO_SUBJECTS)
    : { kind: "empty" };
  const filters = term
    ? filtersFor(query, {
        ...bannerFilters,
        instructor: settledInstructor,
      })
    : null;

  const search = useInfiniteQuery({
    ...searchSectionsInfiniteOptions({
      path: { term: term ?? "" },
      query: filters ?? {},
      meta: { errorMessage: "Couldn't search Banner's classes." },
    }),
    enabled: filters !== null,
    // The first page has no cursor. An object, which the generated client reads
    // as the page's request parameters; null would count as one and crash.
    initialPageParam: { path: { term: term ?? "" } },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    select: mergePages,
  });

  const typing =
    isTyping(input, settledInput) ||
    isTyping(bannerFilters.instructor, settledInstructor);
  const result = filters ? (search.data ?? null) : null;
  const refreshing = search.isFetching && !search.isFetchingNextPage;

  let status: SearchStatus;
  if (!term) status = "idle";
  else if (!subjectsSettled || typing) status = "loading";
  else if (!filters) status = "idle";
  else if (search.isError && !refreshing) status = "error";
  else if (search.isPending || refreshing) status = "loading";
  else status = "ready";

  return {
    query,
    status,
    result,
    stale: status === "error" && result !== null,
    error: filters ? queryError(search.error) : null,
    hasMore: result !== null && search.hasNextPage,
    loadingMore: search.isFetchingNextPage,
    loadMore: () => {
      if (search.hasNextPage && !search.isFetchingNextPage) {
        void search.fetchNextPage();
      }
    },
    refresh: () => void search.refetch(),
  };
}
