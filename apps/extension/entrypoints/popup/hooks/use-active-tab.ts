import { useQuery } from "@tanstack/react-query";

// The URLs the content script runs on (see wxt.config.ts host_permissions).
const BANNER_PAGE = /^https?:\/\/[^/]+\.edu\/(StudentRegistrationSsb|ssb)\//i;

/** Whether the tab the popup opened over is a Banner page. */
export function useOnBannerPage() {
  return useQuery({
    queryKey: ["activeTabOnBanner"],
    queryFn: async () => {
      const [tab] = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });
      return BANNER_PAGE.test(tab?.url ?? "");
    },
    staleTime: Infinity,
  });
}
