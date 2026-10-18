import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AutoRegSnapshot } from "@workspace/shared/types/auto-reg";
import type { BannerConnection } from "@workspace/shared/types/store";
import { AUTO_REG_RUN_STATE_KEY } from "@/lib/auto-reg-run-state";
import { AUTO_REG_SCHEDULE_CONFIG_KEY } from "@/lib/auto-reg-schedule-config";
import { askBackground } from "../lib/ask-background";

const AUTO_REGISTER = ["autoRegister"] as const;

/** Auto-register as the background has it, current when it's armed, run or edited. */
export function useAutoRegister() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const onChanged = (changes: Record<string, unknown>) => {
      if (
        AUTO_REG_RUN_STATE_KEY in changes ||
        AUTO_REG_SCHEDULE_CONFIG_KEY in changes
      ) {
        void queryClient.invalidateQueries({ queryKey: AUTO_REGISTER });
      }
    };
    browser.storage.local.onChanged.addListener(onChanged);
    return () => browser.storage.local.onChanged.removeListener(onChanged);
  }, [queryClient]);

  const snapshot = useQuery({
    queryKey: AUTO_REGISTER,
    queryFn: () => askBackground<AutoRegSnapshot>("AUTOREG_GET"),
  });
  const disarm = useMutation({
    mutationFn: () => askBackground("AUTOREG_DISARM"),
    onSettled: () => queryClient.invalidateQueries({ queryKey: AUTO_REGISTER }),
  });
  return { snapshot, disarm };
}

/** Banner as the extension sees it: an open tab, and whether it's signed in. */
export function useBannerConnection() {
  return useQuery({
    queryKey: ["bannerConnection"],
    queryFn: () => askBackground<BannerConnection>("BANNER_STATUS"),
  });
}
