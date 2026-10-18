import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { TooltipProvider } from "@workspace/ui/components/tooltip";
import App from "@/entrypoints/popup/App";
import type { ExtensionMessage, MessageType } from "@/lib/messaging";

type Handler = (payload: unknown) => unknown;

/**
 * Stands in for the background worker: answers the popup's messages by type.
 * A handler's return value is the data; throwing becomes `{ success: false }`.
 */
export function answerBackground(
  handlers: Partial<Record<MessageType, Handler>>,
) {
  const sent: ExtensionMessage[] = [];
  // Chrome-style, like lib/messaging's onMessage: reply through sendResponse
  // and return true to keep the channel open.
  fakeBrowser.runtime.onMessage.addListener(
    (
      message: unknown,
      _sender: unknown,
      sendResponse: (res: unknown) => void,
    ) => {
      const msg = message as ExtensionMessage;
      sent.push(msg);
      const handler = handlers[msg.type];
      if (!handler) {
        sendResponse({
          success: false,
          error: `No test handler for ${msg.type}`,
        });
        return true;
      }
      try {
        sendResponse({ success: true, data: handler(msg.payload) });
      } catch (err) {
        sendResponse({ success: false, error: (err as Error).message });
      }
      return true;
    },
  );
  return sent;
}

/** The popup as Chrome opens it, with a fresh query cache. */
export function renderPopup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <App />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}
