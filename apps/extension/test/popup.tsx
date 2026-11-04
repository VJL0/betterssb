import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { TooltipProvider } from "@workspace/ui/components/tooltip";
import App from "@/entrypoints/popup/App";
import type {
  ExtensionMessage,
  MessagePayloads,
  MessageType,
} from "@/lib/messaging";

type Handlers = {
  [K in MessageType]?: (payload: MessagePayloads[K]) => unknown;
};

function hasHandler(handlers: Handlers, msg: ExtensionMessage): boolean {
  return handlers[msg.type] !== undefined;
}

// Generic so TypeScript pairs the message's type with its handler's payload.
function answer<K extends MessageType>(
  handlers: Handlers,
  msg: ExtensionMessage<K>,
): unknown {
  return handlers[msg.type]?.(msg.payload);
}

/**
 * Stands in for the background worker: answers the popup's messages by type.
 * A handler's return value is the data; throwing becomes `{ success: false }`.
 */
export function answerBackground(handlers: Handlers) {
  const sent: ExtensionMessage[] = [];
  // Chrome-style, like lib/messaging's onMessage: reply through sendResponse
  // and return true to keep the channel open.
  fakeBrowser.runtime.onMessage.addListener(
    (
      msg: ExtensionMessage,
      _sender: unknown,
      sendResponse: (res: unknown) => void,
    ) => {
      sent.push(msg);
      if (!hasHandler(handlers, msg)) {
        sendResponse({
          success: false,
          error: `No test handler for ${msg.type}`,
        });
        return true;
      }
      try {
        sendResponse({ success: true, data: answer(handlers, msg) });
      } catch (err) {
        sendResponse({
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
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
