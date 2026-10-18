import { useSettings } from "./use-settings";
import { useTerms, type Term } from "./use-terms";

/**
 * The term the app is planning: the one picked in the top bar, else the
 * newest plannable term. Null while terms load or if they can't.
 */
export function useCurrentTerm(): {
  term: Term | null;
  status: "loading" | "ready" | "error";
} {
  const terms = useTerms();
  const { settings } = useSettings();
  if (terms.status !== "ready") return { term: null, status: terms.status };
  const term =
    terms.terms.find((t) => t.code === settings.term) ?? terms.terms[0] ?? null;
  return { term, status: "ready" };
}
