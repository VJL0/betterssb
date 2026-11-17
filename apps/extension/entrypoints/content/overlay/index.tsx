import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { addDocumentRules, OVERLAY_FONT_PATH } from "./document-rules";
import { OverlayApp } from "./overlay-app";
import overlayCss from "./overlay.css?inline";
import { createRatingSlotWatcher } from "./rating-slots";
import { createShadowHost, LAYER_SLOT } from "./shadow-host";

/**
 * Starts the Banner overlay. One React root lives in a page-level shadow host,
 * which also holds the rating popups; each rating renders through a portal
 * into a small shadow root before its instructor in Banner's table.
 */
export function startOverlay(): void {
  addDocumentRules(overlayCss, browser.runtime.getURL(OVERLAY_FONT_PATH));
  const layer = createShadowHost(overlayCss, LAYER_SLOT, "block");
  document.body.append(layer.host);

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  createRoot(layer.container).render(
    <QueryClientProvider client={queryClient}>
      <OverlayApp
        watcher={createRatingSlotWatcher(overlayCss)}
        popupContainer={layer.container}
      />
    </QueryClientProvider>,
  );
}
