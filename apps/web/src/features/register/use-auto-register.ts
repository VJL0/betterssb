import { useCallback, useEffect } from "react";
import {
  queryOptions,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import {
  ApiError,
  getSection,
  type SectionSummary,
} from "@workspace/api-client";
import { getSectionQueryKey } from "@workspace/api-client/query";
import type { AutoRegQueue } from "@workspace/shared/types/auto-reg";
import {
  armAutoRegister,
  disarmAutoRegister,
  getAutoRegister,
  getBannerPlans,
  getBannerRegistrationTerms,
  getRegistrationTime,
  onAutoRegisterChange,
  saveAutoRegisterQueue,
} from "@/lib/extension";

/** Banner's terms and plans change rarely while the page is open. */
const BANNER_STALE_MS = 5 * 60 * 1000;
/** A CRN names the same section all term. */
const SECTION_STALE_MS = 24 * 60 * 60 * 1000;
/**
 * A CRN Banner says isn't in the term is an answer too, kept for less time
 * than a found one since a section can be added mid-term. Matches the API's
 * MISSING_SECTION_TTL_SECONDS.
 */
const MISSING_SECTION_STALE_MS = 5 * 60 * 1000;
const NOT_FOUND = 404;

/**
 * The extension's copy is the source of truth and says when it changes, so
 * it's never stale on its own; `onAutoRegisterChange` invalidates it.
 */
const autoRegisterOptions = queryOptions({
  queryKey: ["autoRegister"],
  queryFn: getAutoRegister,
  staleTime: Infinity,
  retry: false,
});
const AUTO_REGISTER_KEY = autoRegisterOptions.queryKey;

/**
 * Auto-register as the extension has it, kept current when it's armed, run
 * or edited in the popup or another tab. Without the extension, nothing loads.
 */
export function useAutoRegister(extensionInstalled: boolean) {
  const queryClient = useQueryClient();
  // Returned so each mutation stays pending until the refetch lands.
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: AUTO_REGISTER_KEY });

  useEffect(
    () =>
      onAutoRegisterChange(
        () =>
          void queryClient.invalidateQueries({ queryKey: AUTO_REGISTER_KEY }),
      ),
    [queryClient],
  );

  const snapshot = useQuery({
    ...autoRegisterOptions,
    enabled: extensionInstalled,
  });

  const save = useMutation({
    mutationFn: saveAutoRegisterQueue,
    // The queue shows the edit at once; a refusal puts it back.
    onMutate: async (queue: AutoRegQueue) => {
      await queryClient.cancelQueries({ queryKey: AUTO_REGISTER_KEY });
      const before = queryClient.getQueryData(AUTO_REGISTER_KEY);
      if (before) {
        queryClient.setQueryData(AUTO_REGISTER_KEY, { ...before, ...queue });
      }
      return { before };
    },
    onError: (_error, _queue, onMutateResult) => {
      if (onMutateResult?.before) {
        queryClient.setQueryData(AUTO_REGISTER_KEY, onMutateResult.before);
      }
    },
    onSettled: refresh,
  });
  const arm = useMutation({ mutationFn: armAutoRegister, onSettled: refresh });
  const disarm = useMutation({
    mutationFn: disarmAutoRegister,
    onSettled: refresh,
  });

  return { snapshot, save, arm, disarm };
}

const bannerTermsOptions = queryOptions({
  queryKey: ["bannerRegistrationTerms"],
  queryFn: getBannerRegistrationTerms,
  staleTime: BANNER_STALE_MS,
  retry: false,
});

function bannerPlansOptions(term: string) {
  return queryOptions({
    queryKey: ["bannerPlans", term],
    queryFn: () => getBannerPlans(term),
    staleTime: BANNER_STALE_MS,
    retry: false,
  });
}

/** Banner's registration terms and the student's Banner plans for `term`, once Banner is connected. */
export function useBannerRegistration(connected: boolean, term: string) {
  const terms = useQuery({ ...bannerTermsOptions, enabled: connected });
  const plans = useQuery({
    ...bannerPlansOptions(term),
    enabled: connected && !!term,
  });
  return { terms, plans };
}

function registrationTimeOptions(term: string) {
  return queryOptions({
    queryKey: ["registrationTime", term],
    queryFn: () => getRegistrationTime(term),
    staleTime: BANNER_STALE_MS,
    retry: false,
  });
}

/** The student's registration time for `term`, as TUportal lists it. */
export function useRegistrationTime(term: string, enabled: boolean) {
  return useQuery({
    ...registrationTimeOptions(term),
    enabled: enabled && !!term,
  });
}

function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === NOT_FOUND;
}

/**
 * The section a CRN names in `term`, or null when Banner has none. A 404 is
 * an expected answer, so it's data the cache keeps rather than an error that
 * would be fetched again on every look; real failures still throw.
 */
function sectionOptions(term: string, crn: string) {
  const request = { path: { term, crn } };
  return queryOptions({
    queryKey: getSectionQueryKey(request),
    queryFn: async ({ signal }): Promise<SectionSummary | null> => {
      try {
        const { data } = await getSection({ ...request, signal });
        return data;
      } catch (error) {
        if (isNotFound(error)) return null;
        throw error;
      }
    },
    staleTime: (query) =>
      query.state.data === null ? MISSING_SECTION_STALE_MS : SECTION_STALE_MS,
  });
}

/** "unchecked" when Banner couldn't be asked, or no term is chosen. */
export type CrnLookup = "found" | "missing" | "unchecked";

/** Looks up a CRN before it's queued, from the cache `useLookedUpSections` reads. */
export function useCrnLookup(term: string) {
  const queryClient = useQueryClient();
  return async (crn: string): Promise<CrnLookup> => {
    if (!term) return "unchecked";
    try {
      const section = await queryClient.query(sectionOptions(term, crn));
      return section ? "found" : "missing";
    } catch {
      return "unchecked";
    }
  };
}

export interface LookedUpSections {
  byCrn: ReadonlyMap<string, SectionSummary>;
  /** CRNs still being looked up. */
  pending: ReadonlySet<string>;
  /** CRNs Banner has no section for in the term. */
  missing: ReadonlySet<string>;
}

/** The course of each CRN, from Banner's public section lookup; no sign-in needed. */
export function useLookedUpSections(
  term: string,
  crns: readonly string[],
): LookedUpSections {
  const key = crns.join(",");
  // Keyed by the CRNs alone, so the result only changes when the data does.
  const combine = useCallback(
    (
      results: UseQueryResult<SectionSummary | null, unknown>[],
    ): LookedUpSections => {
      const byCrn = new Map<string, SectionSummary>();
      const pending = new Set<string>();
      const missing = new Set<string>();
      const queried = key.split(",");
      for (const [index, result] of results.entries()) {
        const crn = queried[index]!;
        if (result.data) byCrn.set(crn, result.data);
        else if (result.data === null) missing.add(crn);
        else if (result.isLoading) pending.add(crn);
      }
      return { byCrn, pending, missing };
    },
    [key],
  );
  return useQueries({
    queries: crns.map((crn) => ({
      ...sectionOptions(term, crn),
      enabled: !!term,
    })),
    combine,
  });
}
