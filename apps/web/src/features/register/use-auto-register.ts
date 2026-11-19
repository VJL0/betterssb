import { useCallback, useEffect } from "react";
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import { ApiError, type SectionSummary } from "@workspace/api-client";
import { getSectionOptions } from "@workspace/api-client/query";
import type {
  AutoRegQueue,
  AutoRegSnapshot,
} from "@workspace/shared/types/auto-reg";
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

const AUTO_REGISTER = ["autoRegister"] as const;
/** Banner's terms and plans change rarely while the page is open. */
const BANNER_STALE_MS = 5 * 60 * 1000;
/** A CRN names the same section all term. */
const SECTION_STALE_MS = 24 * 60 * 60 * 1000;
const NOT_FOUND = 404;

/**
 * Auto-register as the extension has it, kept current when it's armed, run
 * or edited in the popup or another tab. Without the extension, nothing loads.
 */
export function useAutoRegister(extensionInstalled: boolean) {
  const queryClient = useQueryClient();
  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: AUTO_REGISTER });

  useEffect(
    () =>
      onAutoRegisterChange(
        () => void queryClient.invalidateQueries({ queryKey: AUTO_REGISTER }),
      ),
    [queryClient],
  );

  const snapshot = useQuery({
    queryKey: AUTO_REGISTER,
    queryFn: getAutoRegister,
    enabled: extensionInstalled,
    staleTime: Infinity,
    retry: false,
  });

  const save = useMutation({
    mutationFn: saveAutoRegisterQueue,
    // The queue shows the edit at once; a refusal puts it back.
    onMutate: async (queue: AutoRegQueue) => {
      await queryClient.cancelQueries({ queryKey: AUTO_REGISTER });
      const before = queryClient.getQueryData<AutoRegSnapshot>(AUTO_REGISTER);
      if (before) {
        queryClient.setQueryData<AutoRegSnapshot>(AUTO_REGISTER, {
          ...before,
          ...queue,
        });
      }
      return { before };
    },
    onError: (_error, _queue, context) => {
      if (context?.before) {
        queryClient.setQueryData(AUTO_REGISTER, context.before);
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

/** Banner's registration terms and the student's Banner plans for `term`, once Banner is connected. */
export function useBannerRegistration(connected: boolean, term: string) {
  const terms = useQuery({
    queryKey: ["bannerRegistrationTerms"],
    queryFn: getBannerRegistrationTerms,
    enabled: connected,
    staleTime: BANNER_STALE_MS,
    retry: false,
  });
  const plans = useQuery({
    queryKey: ["bannerPlans", term],
    queryFn: () => getBannerPlans(term),
    enabled: connected && !!term,
    staleTime: BANNER_STALE_MS,
    retry: false,
  });
  return { terms, plans };
}

/** The student's registration time for `term`, as TUportal lists it. */
export function useRegistrationTime(term: string, enabled: boolean) {
  return useQuery({
    queryKey: ["registrationTime", term],
    queryFn: () => getRegistrationTime(term),
    enabled: enabled && !!term,
    staleTime: BANNER_STALE_MS,
    retry: false,
  });
}

function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === NOT_FOUND;
}

function sectionQuery(term: string, crn: string) {
  return {
    ...getSectionOptions({ path: { crn }, query: { term } }),
    staleTime: SECTION_STALE_MS,
  };
}

/** "unchecked" when Banner couldn't be asked, or no term is chosen. */
export type CrnLookup = "found" | "missing" | "unchecked";

/** Looks up a CRN before it's queued, from the cache `useLookedUpSections` reads. */
export function useCrnLookup(term: string) {
  const queryClient = useQueryClient();
  return async (crn: string): Promise<CrnLookup> => {
    if (!term) return "unchecked";
    try {
      await queryClient.query(sectionQuery(term, crn));
      return "found";
    } catch (error) {
      return isNotFound(error) ? "missing" : "unchecked";
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
    (results: UseQueryResult<SectionSummary, unknown>[]): LookedUpSections => {
      const byCrn = new Map<string, SectionSummary>();
      const pending = new Set<string>();
      const missing = new Set<string>();
      const queried = key.split(",");
      results.forEach((result, index) => {
        const crn = queried[index]!;
        if (result.data) byCrn.set(crn, result.data);
        else if (result.isPending && result.isFetching) pending.add(crn);
        else if (isNotFound(result.error)) missing.add(crn);
      });
      return { byCrn, pending, missing };
    },
    [key],
  );
  return useQueries({
    queries: crns.map((crn) => ({
      ...sectionQuery(term, crn),
      enabled: !!term,
    })),
    combine,
  });
}
