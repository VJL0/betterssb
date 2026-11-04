import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isAutoRegSnapshot } from "@workspace/shared/lib/auto-reg-queue";
import { isBannerConnection } from "@workspace/shared/lib/store";
import { AUTO_REG_RUN_STATE_KEY } from "@/lib/auto-reg-run-state";
import { AUTO_REG_QUEUE_KEY } from "@/lib/auto-reg-queue-storage";
import { askBackground, tellBackground } from "@/lib/ask-background";

const AUTO_REGISTER = ["autoRegister"] as const;

/** Auto-register as the background has it, current when it's armed, run or edited. */
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

  const snapshot = useQuery({
    queryKey: AUTO_REGISTER,
    queryFn: () =>
      askBackground({ type: "AUTOREG_GET", payload: {} }, isAutoRegSnapshot),
  });
  const disarm = useMutation({
    mutationFn: () => tellBackground({ type: "AUTOREG_DISARM", payload: {} }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: AUTO_REGISTER }),
  });
  return { snapshot, disarm };
}

/** Banner as the extension sees it: an open tab, and whether it's signed in. */
export function useBannerConnection() {
  return useQuery({
    queryKey: ["bannerConnection"],
    queryFn: () =>
      askBackground({ type: "BANNER_STATUS", payload: {} }, isBannerConnection),
  });
}
