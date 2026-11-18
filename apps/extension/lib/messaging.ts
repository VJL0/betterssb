import type { AutoRegQueue } from "@workspace/shared/types/auto-reg";

type NoPayload = Record<string, never>;

/** Each message type's payload; `switch (msg.type)` narrows `msg.payload` to it. */
export interface MessagePayloads {
  FETCH_RATING: { name: string };
  // Banner calls, made by the background with the student's cookies.
  SSB_REG_GET_TERMS: NoPayload;
  SSB_REG_GET_PLANS: { term: string };
  /** To a Banner tab: restart the page's own idle-logout timer. */
  BANNER_RESTART_TIMER: NoPayload;
  DARS_RUN_AUDIT: NoPayload;
  BANNER_STATUS: NoPayload;
  AUTOREG_GET: NoPayload;
  AUTOREG_SAVE_QUEUE: { queue: AutoRegQueue };
  AUTOREG_ARM: NoPayload;
  AUTOREG_DISARM: NoPayload;
  AUTOREG_CHECK_CRNS: { term: string; crns: string[] };
  AUTOREG_REGISTRATION_TIME: { term: string };
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

export function sendTabMessage(
  tabId: number,
  msg: ExtensionMessage,
): Promise<ExtensionResponse> {
  return browser.tabs.sendMessage<ExtensionMessage, ExtensionResponse>(
    tabId,
    msg,
  );
}

/** Listens for extension messages, in the background or a content script. */
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
