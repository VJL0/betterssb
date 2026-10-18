import { render } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import type { ReactElement } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { vi } from "vitest";
import { TooltipProvider } from "@workspace/ui/components/tooltip";
import { IndexedDbStore } from "@/lib/store/indexeddb-store";
import { StoreProvider } from "@/lib/store/store-context";

/**
 * Renders a page inside the app's providers: a memory router at `route`, and
 * the local store backed by a fresh fake IndexedDB.
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
  const view = render(
    <StoreProvider open={async () => ({ store, location: "browser" })}>
      <TooltipProvider>
        <RouterProvider router={router} />
      </TooltipProvider>
    </StoreProvider>,
  );
  return { ...view, store, router };
}
