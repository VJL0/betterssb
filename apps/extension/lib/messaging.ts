import type { AutoRegQueue } from "@workspace/shared/types/auto-reg";

type NoPayload = Record<string, never>;

/** Each message type's payload; `switch (msg.type)` narrows `msg.payload` to it. */
export interface MessagePayloads {
  FETCH_RATING: { name: string };
  // Answered by the content script in a Banner tab (the background relays them).
  SSB_REG_GET_TERMS: NoPayload;
  SSB_REG_GET_PLANS: NoPayload;
  SSB_REG_GET_SECTION_CRN: { crn: string; term: string };
  SSB_AUTO_REGISTER_RUN: { term: string; crnList: string[] };
  DARS_RUN_AUDIT: NoPayload;
  BANNER_STATUS: NoPayload;
  AUTOREG_GET: NoPayload;
  AUTOREG_SAVE_QUEUE: { queue: AutoRegQueue };
  AUTOREG_ARM: NoPayload;
  AUTOREG_DISARM: NoPayload;
  AUTOREG_CHECK_CRNS: { term: string; crns: string[] };
  AUTOREG_REGISTRATION_TIME: { term: string };
  OVERLAY_STATUS: NoPayload;
}

export type MessageType = keyof MessagePayloads;

/** A message of type `K` (any type by default), with that type's payload. */
export type ExtensionMessage<K extends MessageType = MessageType> = {
  [T in K]: { type: T; payload: MessagePayloads[T] };
}[K];

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
