export type MessageType =
  | "SEARCH_SCHOOLS"
  | "FETCH_RATING"
  | "GENERATE_SCHEDULE"
  | "CHAT"
  | "PARSE_TRANSCRIPT"
  | "CHECK_PREREQS"
  | "SSB_GET_TERMS"
  | "SSB_GET_SUBJECTS"
  | "SSB_SEARCH_SECTIONS"
  | "SSB_SEARCH_COURSES"
  | "SSB_GET_CLASS_DETAILS"
  | "SSB_GET_ENROLLMENT"
  | "SSB_GET_PREREQS"
  | "SSB_RESET_FORM"
  | "SSB_PLAN_GET_TERMS"
  | "SSB_PLAN_SAVE_TERM"
  | "SSB_PLAN_ADD_ITEM"
  | "SSB_PLAN_GET_EVENTS"
  | "SSB_PLAN_SUBMIT_BATCH"
  | "SSB_REG_HISTORY"
  | "SSB_REG_EVENTS"
  | "SSB_REG_MEETING_INFO"
  | "SSB_REG_GET_TERMS"
  | "SSB_REG_SAVE_TERM"
  | "SSB_REG_SEARCH_TERM"
  | "SSB_REG_RESET"
  | "SSB_REG_GET_SECTION_CRN"
  | "SSB_REG_GET_PLANS"
  | "SSB_REG_ADD_CRNS"
  | "SSB_REG_ADD_ITEM"
  | "SSB_REG_SUBMIT_BATCH"
  | "SSB_REG_TUITION"
  | "SSB_AUTO_REGISTER_RUN";

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

/**
 * Send a message directly to a specific tab's content script.
 */
export function sendTabMessage(
  tabId: number,
  msg: ExtensionMessage,
): Promise<ExtensionResponse> {
  return chrome.tabs.sendMessage<ExtensionMessage, ExtensionResponse>(
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
  chrome.runtime.onMessage.addListener(
    (
      message: ExtensionMessage,
      _sender: chrome.runtime.MessageSender,
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
  chrome.runtime.onMessage.addListener(
    (
      message: ExtensionMessage,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (res: ExtensionResponse) => void,
    ) => {
      handler(message, sendResponse);
      return true;
    },
  );
}
