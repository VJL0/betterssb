export type MessageType =
  | "FETCH_RATING"
  // Answered by the content script in a Banner tab (the background relays them).
  | "SSB_REG_GET_TERMS"
  | "SSB_REG_GET_PLANS"
  | "SSB_REG_GET_SECTION_CRN"
  | "SSB_AUTO_REGISTER_RUN"
  | "DARS_RUN_AUDIT"
  | "BANNER_STATUS"
  | "AUTOREG_GET"
  | "AUTOREG_SAVE_QUEUE"
  | "AUTOREG_ARM"
  | "AUTOREG_DISARM"
  | "AUTOREG_CHECK_CRNS"
  | "AUTOREG_REGISTRATION_TIME"
  | "OVERLAY_STATUS";

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
  return browser.runtime.sendMessage<ExtensionMessage, ExtensionResponse>(msg);
}

/**
 * Send a message directly to a specific tab's content script.
 */
export function sendTabMessage(
  tabId: number,
  msg: ExtensionMessage,
): Promise<ExtensionResponse> {
  return browser.tabs.sendMessage<ExtensionMessage, ExtensionResponse>(
    tabId,
    msg,
  );
}

export function onMessage(
  handler: (
    msg: ExtensionMessage,
    sendResponse: (res: ExtensionResponse) => void,
  ) => void,
): void {
  browser.runtime.onMessage.addListener(
    (
      message: ExtensionMessage,
      _sender: Browser.runtime.MessageSender,
      sendResponse: (res: ExtensionResponse) => void,
    ) => {
      handler(message, sendResponse);
      return true;
    },
  );
}

/**
 * Listen for messages in a content script (from background or popup).
 */
export function onContentMessage(
  handler: (
    msg: ExtensionMessage,
    sendResponse: (res: ExtensionResponse) => void,
  ) => void,
): void {
  browser.runtime.onMessage.addListener(
    (
      message: ExtensionMessage,
      _sender: Browser.runtime.MessageSender,
      sendResponse: (res: ExtensionResponse) => void,
    ) => {
      handler(message, sendResponse);
      return true;
    },
  );
}
