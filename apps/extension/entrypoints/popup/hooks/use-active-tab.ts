import { useQuery } from "@tanstack/react-query";
import { sendTabMessage } from "@/lib/messaging";
import type { OverlayStatus } from "@/lib/overlay-status";
import { isBannerPage } from "@/lib/temple-urls";

/** Whether the tab the popup opened over is a Banner page. */
export function useOnBannerPage() {
  return useQuery({
    queryKey: ["activeTabOnBanner"],
    queryFn: async () => {
      const [tab] = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });
      return isBannerPage(tab?.url ?? "");
    },
    staleTime: Infinity,
  });
}

/**
 * What the Banner overlay shows on the tab the popup opened over: null when
 * the tab has no results grid, the overlay is off, or the page loaded before
 * the extension (its content script isn't there to answer).
 */
export function useOverlayStatus(onBanner: boolean) {
  return useQuery({
    queryKey: ["overlayStatus"],
    enabled: onBanner,
    queryFn: async (): Promise<OverlayStatus | null> => {
      const [tab] = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (tab?.id === undefined) return null;
      const response = await sendTabMessage(tab.id, {
        type: "OVERLAY_STATUS",
        payload: {},
      }).catch(() => null);
      return response?.success ? (response.data as OverlayStatus | null) : null;
    },
  });
}
