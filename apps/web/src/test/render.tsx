import { QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import type { ReactElement } from "react";
import { vi } from "vitest";
import { TooltipProvider } from "@workspace/ui/components/tooltip";
import { IndexedDbStore } from "@/lib/store/indexeddb-store";
import { createQueryClient } from "@/lib/query-client";
import { StoreProvider } from "@/lib/store/store-context";
import { setTestUrl } from "./navigation";

/**
 * Renders a page inside the app's providers: the URL at `route`, a fresh
 * query cache, and the local store backed by a fresh fake IndexedDB.
 */
export function renderPage(
  element: ReactElement,
  { route = "/" }: { route?: string } = {},
) {
  vi.stubGlobal("indexedDB", new IDBFactory());
  const store = new IndexedDbStore();
  setTestUrl(route);
  // A fresh cache per test, and failures show at once.
  const queryClient = createQueryClient();
  queryClient.setDefaultOptions({
    queries: { ...queryClient.getDefaultOptions().queries, retry: false },
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <StoreProvider open={async () => ({ store, location: "browser" })}>
        <TooltipProvider>{element}</TooltipProvider>
      </StoreProvider>
    </QueryClientProvider>,
  );
  return { ...view, store, queryClient };
}
