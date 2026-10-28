import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AutoRegQueue,
  AutoRegSnapshot,
} from "@workspace/shared/types/auto-reg";
import {
  armAutoRegister,
  checkCrns,
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

/** Banner's registration terms and the student's Banner plans, once Banner is connected. */
export function useBannerRegistration(connected: boolean) {
  const terms = useQuery({
    queryKey: ["bannerRegistrationTerms"],
    queryFn: getBannerRegistrationTerms,
    enabled: connected,
    staleTime: BANNER_STALE_MS,
    retry: false,
  });
  const plans = useQuery({
    queryKey: ["bannerPlans"],
    queryFn: getBannerPlans,
    enabled: connected,
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

/** Whether Banner knows each queued CRN in the term. */
export function useCrnChecks(
  term: string,
  crns: readonly string[],
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["crnChecks", term, crns],
    queryFn: () => checkCrns(term, [...crns]),
    enabled: enabled && !!term && crns.length > 0,
    staleTime: BANNER_STALE_MS,
    retry: false,
  });
}
