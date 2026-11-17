import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { isAutoRegSnapshot } from "@workspace/shared/lib/auto-reg-queue";
import { isBannerConnection } from "@workspace/shared/lib/store";
import { AUTO_REG_RUN_STATE_KEY } from "@/lib/auto-reg-run-state";
import { AUTO_REG_QUEUE_KEY } from "@/lib/auto-reg-queue-storage";
import { BANNER_CONNECTION_KEY } from "@/lib/banner-session";
import { askBackground } from "@/lib/ask-background";

const AUTO_REGISTER = ["autoRegister"] as const;
const BANNER_CONNECTION = ["bannerConnection"] as const;
/** Each check asks Banner, so an open popup rechecks this often. */
const BANNER_RECHECK_MS = 30_000;

/** Auto-register as the background has it, current when it's armed, run or edited. Disarming is on the website. */
export function useAutoRegister() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const onChanged = (changes: Record<string, unknown>) => {
      if (AUTO_REG_RUN_STATE_KEY in changes || AUTO_REG_QUEUE_KEY in changes) {
        void queryClient.invalidateQueries({ queryKey: AUTO_REGISTER });
      }
    };
    browser.storage.local.onChanged.addListener(onChanged);
    return () => browser.storage.local.onChanged.removeListener(onChanged);
  }, [queryClient]);

  return useQuery({
    queryKey: AUTO_REGISTER,
    queryFn: () =>
      askBackground({ type: "AUTOREG_GET", payload: {} }, isAutoRegSnapshot),
  });
}

/**
 * Whether the student is signed in to Banner, live: rechecked while the popup
 * is open and as soon as the background sees a change.
 */
export function useBannerConnection() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const onChanged = (changes: Record<string, unknown>) => {
      if (BANNER_CONNECTION_KEY in changes) {
        void queryClient.invalidateQueries({ queryKey: BANNER_CONNECTION });
      }
    };
    browser.storage.local.onChanged.addListener(onChanged);
    return () => browser.storage.local.onChanged.removeListener(onChanged);
  }, [queryClient]);

  return useQuery({
    queryKey: BANNER_CONNECTION,
    refetchInterval: BANNER_RECHECK_MS,
    queryFn: () =>
      askBackground({ type: "BANNER_STATUS", payload: {} }, isBannerConnection),
  });
}
