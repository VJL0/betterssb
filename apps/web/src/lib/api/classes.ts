import type {
  ClassSearchFilters,
  ClassSearchResult,
} from "@workspace/shared/types/classes";
import type { SSBCodeDescription } from "@workspace/shared/types/ssb";
import { requestJson } from "./http";

/** Terms with a published schedule, newest first. */
export function fetchTerms(
  signal?: AbortSignal,
): Promise<SSBCodeDescription[]> {
  return requestJson("/classes/terms", {
    signal,
    errorMessage: "Couldn't load terms from Banner.",
  });
}

export function fetchSubjects(
  term: string,
  query = "",
  signal?: AbortSignal,
): Promise<SSBCodeDescription[]> {
  return requestJson("/classes/subjects", {
    signal,
    query: { term, q: query },
    errorMessage: "Couldn't load subjects from Banner.",
  });
}

export function fetchAttributes(
  term: string,
  signal?: AbortSignal,
): Promise<SSBCodeDescription[]> {
  return requestJson("/classes/attributes", {
    signal,
    query: { term },
    errorMessage: "Couldn't load section attributes from Banner.",
  });
}

/** Sections from Banner's public class search, with live seats. */
export function searchClasses(
  filters: ClassSearchFilters,
  signal?: AbortSignal,
): Promise<ClassSearchResult> {
  return requestJson("/classes/search", {
    signal,
    query: { ...filters },
    errorMessage: "Couldn't search Banner's classes.",
  });
}
