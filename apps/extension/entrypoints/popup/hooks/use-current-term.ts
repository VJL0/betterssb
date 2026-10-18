import { useQuery } from "@tanstack/react-query";
import { listTermsOptions } from "@workspace/api-client/query";
import { formatTermName, isViewOnlyTerm } from "@workspace/shared/lib/terms";
import { useStoreDocument } from "@/hooks/use-store-document";

export interface Term {
  code: string;
  name: string;
}

/**
 * The term picked on the website (shared settings), else the newest
 * plannable term from Banner's class search. Null while either loads.
 */
export function useCurrentTerm(): Term | null {
  const settings = useStoreDocument("settings");
  const terms = useQuery({
    ...listTermsOptions(),
    staleTime: Infinity,
    select: (list) =>
      list
        .filter((t) => !isViewOnlyTerm(t.description))
        .map((t) => ({ code: t.code, name: formatTermName(t.description) })),
  });
  if (!settings.loaded || !terms.data) return null;
  const wanted = settings.value?.term;
  return terms.data.find((t) => t.code === wanted) ?? terms.data[0] ?? null;
}
