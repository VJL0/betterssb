import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { addDocumentRules, OVERLAY_FONT_PATH } from "./document-rules";
import { OverlayApp } from "./overlay-app";
import overlayCss from "./overlay.css?inline";
import { createRowWatcher } from "./row-watcher";
import { createShadowHost, LAYER_SLOT } from "./shadow-host";

/**
 * Starts the Banner overlay. One React root lives in a page-level shadow host
 * (the plan dock and popups); ratings, seats and tags render through portals
 * into small shadow roots inside Banner's own table cells.
 */
export function startOverlay(): void {
  // WXT types getURL with public/ files only; the font is copied in by a build hook.
  const extensionUrl = browser.runtime.getURL as (path: string) => string;
  addDocumentRules(overlayCss, extensionUrl(OVERLAY_FONT_PATH));
  const layer = createShadowHost(overlayCss, LAYER_SLOT, "block");
  document.body.append(layer.host);

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  createRoot(layer.container).render(
    <QueryClientProvider client={queryClient}>
      <OverlayApp
        watcher={createRowWatcher(overlayCss)}
        popupContainer={layer.container}
      />
    </QueryClientProvider>,
  );
}
