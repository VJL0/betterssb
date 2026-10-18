import { QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import type { ReactElement } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { vi } from "vitest";
import { TooltipProvider } from "@workspace/ui/components/tooltip";
import { IndexedDbStore } from "@/lib/store/indexeddb-store";
import { createQueryClient } from "@/lib/query-client";
import { StoreProvider } from "@/lib/store/store-context";

/**
 * Renders a page inside the app's providers: a memory router at `route`, a
 * fresh query cache, and the local store backed by a fresh fake IndexedDB.
 */
export function renderPage(
  element: ReactElement,
  { route = "/", path = "*" }: { route?: string; path?: string } = {},
) {
  vi.stubGlobal("indexedDB", new IDBFactory());
  const store = new IndexedDbStore();
  const router = createMemoryRouter(
    [
      { path, element },
      { path: "*", element: <p>Elsewhere</p> },
    ],
    { initialEntries: [route] },
  );
  // A fresh cache per test, and failures show at once.
  const queryClient = createQueryClient();
  queryClient.setDefaultOptions({
    queries: { ...queryClient.getDefaultOptions().queries, retry: false },
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <StoreProvider open={async () => ({ store, location: "browser" })}>
        <TooltipProvider>
          <RouterProvider router={router} />
        </TooltipProvider>
      </StoreProvider>
    </QueryClientProvider>,
  );
  return { ...view, store, router, queryClient };
}
