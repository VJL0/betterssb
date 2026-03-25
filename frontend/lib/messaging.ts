export type MessageType =
  | "FETCH_RATING"
  | "GENERATE_SCHEDULE"
  | "CHAT"
  | "PARSE_TRANSCRIPT"
  | "CHECK_PREREQS";

export interface ExtensionMessage {
  type: MessageType;
  payload: unknown;
}

export interface ExtensionResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}

export function sendMessage(msg: ExtensionMessage): Promise<ExtensionResponse> {
  return chrome.runtime.sendMessage<ExtensionMessage, ExtensionResponse>(msg);
}

export function onMessage(
  handler: (
    msg: ExtensionMessage,
    sendResponse: (res: ExtensionResponse) => void
  ) => void
): void {
  chrome.runtime.onMessage.addListener(
    (
      message: ExtensionMessage,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (res: ExtensionResponse) => void
    ) => {
      handler(message, sendResponse);
      return true; // keep the message channel open for async responses
    }
  );
}
