import { useQuery } from "@tanstack/react-query";
import { queryError, type CodeDescription } from "@workspace/api-client";
import { listTermsOptions } from "@workspace/api-client/query";
import { formatTermName, isViewOnlyTerm } from "@workspace/shared/lib/terms";

/** Terms change a few times a year. */
const TERMS_STALE_MS = 60 * 60 * 1000;
const NO_TERMS: Term[] = [];

export interface Term {
  code: string;
  /** "Spring 2027". */
  name: string;
}

type TermsState =
  | { status: "loading"; terms: Term[] }
  | { status: "ready"; terms: Term[] }
  | { status: "error"; terms: Term[]; error: Error };

/** Past, view-only terms can't be planned or registered for. */
function plannableTerms(terms: CodeDescription[]): Term[] {
  return terms
    .filter((t) => !isViewOnlyTerm(t.description))
    .map((t) => ({ code: t.code, name: formatTermName(t.description) }));
}

/** Terms open for planning (not view-only), newest first. */
export function useTerms(): TermsState {
  const query = useQuery({
    ...listTermsOptions({
      meta: { errorMessage: "Couldn't load terms from Banner." },
    }),
    staleTime: TERMS_STALE_MS,
    select: plannableTerms,
  });
  if (query.isSuccess) return { status: "ready", terms: query.data };
  if (query.isError) {
    return {
      status: "error",
      terms: NO_TERMS,
      error: queryError(query.error) ?? new Error("Couldn't load terms."),
    };
  }
  return { status: "loading", terms: NO_TERMS };
}
