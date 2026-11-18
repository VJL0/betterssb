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
const AUTO_REGISTER_STORAGE = [AUTO_REG_RUN_STATE_KEY, AUTO_REG_QUEUE_KEY];
const BANNER_CONNECTION_STORAGE = [BANNER_CONNECTION_KEY];
/** Each check asks Banner, so an open popup rechecks this often. */
const BANNER_RECHECK_MS = 30_000;

/** Refetches `queryKey` as soon as the background writes one of `storageKeys`. */
function useRefetchOnStorageChange(
  queryKey: readonly string[],
  storageKeys: readonly string[],
) {
  const queryClient = useQueryClient();
  useEffect(() => {
    const onChanged = (changes: Record<string, unknown>) => {
      if (storageKeys.some((key) => key in changes)) {
        void queryClient.invalidateQueries({ queryKey });
      }
    };
    browser.storage.local.onChanged.addListener(onChanged);
    return () => browser.storage.local.onChanged.removeListener(onChanged);
  }, [queryClient, queryKey, storageKeys]);
}

/** Auto-register as the background has it, kept current as it's turned on, run or edited. */
export function useAutoRegister() {
  useRefetchOnStorageChange(AUTO_REGISTER, AUTO_REGISTER_STORAGE);

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
  useRefetchOnStorageChange(BANNER_CONNECTION, BANNER_CONNECTION_STORAGE);

  return useQuery({
    queryKey: BANNER_CONNECTION,
    refetchInterval: BANNER_RECHECK_MS,
    queryFn: () =>
      askBackground({ type: "BANNER_STATUS", payload: {} }, isBannerConnection),
  });
}
