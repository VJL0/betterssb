import { useEffect, useState } from "react";
import { formatTermName, isViewOnlyTerm } from "@workspace/shared/lib/terms";
import { fetchTerms } from "@/lib/api/classes";

export interface Term {
  code: string;
  /** "Spring 2027". */
  name: string;
}

type TermsState =
  | { status: "loading"; terms: Term[] }
  | { status: "ready"; terms: Term[] }
  | { status: "error"; terms: Term[]; error: Error };

// Terms change a few times a year; one request per page load is plenty.
let termsRequest: Promise<Term[]> | null = null;

function loadTerms(): Promise<Term[]> {
  termsRequest ??= fetchTerms()
    // Past, view-only terms can't be planned or registered for.
    .then((terms) =>
      terms
        .filter((t) => !isViewOnlyTerm(t.description))
        .map((t) => ({ code: t.code, name: formatTermName(t.description) })),
    )
    .catch((err: unknown) => {
      termsRequest = null;
      throw err;
    });
  return termsRequest;
}

/** Terms open for planning (not view-only), newest first. */
export function useTerms(): TermsState {
  const [state, setState] = useState<TermsState>({
    status: "loading",
    terms: [],
  });

  useEffect(() => {
    let cancelled = false;
    loadTerms().then(
      (terms) => !cancelled && setState({ status: "ready", terms }),
      (err: unknown) =>
        !cancelled &&
        setState({
          status: "error",
          terms: [],
          error: err instanceof Error ? err : new Error(String(err)),
        }),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
