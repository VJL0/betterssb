import { DefaultChatTransport, type UIMessage } from "ai";
import { client, queryError, type ChatMessage } from "@workspace/api-client";

export function messageText(message: UIMessage): string {
  return message.parts
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("");
}

export function storedMessages(messages: UIMessage[]): ChatMessage[] {
  return messages.flatMap((message) =>
    message.role === "system"
      ? []
      : [
          {
            role: message.role,
            content: messageText(message),
          },
        ],
  );
}

/** The SDK owns SSE parsing and cancellation; adapt only our request and HTTP errors. */
export function advisorTransport(): DefaultChatTransport<UIMessage> {
  const config = client.getConfig();
  return new DefaultChatTransport({
    api: client.buildUrl({ url: "/api/chat" }),
    credentials: config.credentials,
    prepareSendMessagesRequest: ({ messages, body }) => ({
      body: {
        messages: storedMessages(messages),
        context: body?.context ?? "",
      },
    }),
    fetch: async (input, init) => {
      const response = await (config.fetch ?? globalThis.fetch)(input, init);
      if (!response.ok) {
        const problem: unknown = await response.json().catch(() => null);
        throw (
          queryError(problem) ??
          new Error("The advisor is unavailable right now.")
        );
      }
      return response;
    },
  });
}
