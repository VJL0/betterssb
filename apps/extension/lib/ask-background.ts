import { sendMessage, type ExtensionMessage } from "@/lib/messaging";

async function successfulReply(msg: ExtensionMessage): Promise<unknown> {
  const response = await sendMessage(msg);
  if (!response?.success) {
    throw new Error(response?.error ?? "The extension didn't respond.");
  }
  return response.data;
}

/**
 * Asks the background worker and returns its data, or throws its error.
 * `isReply` checks the data, which crosses from another extension context.
 */
export async function askBackground<T>(
  msg: ExtensionMessage,
  isReply: (data: unknown) => data is T,
): Promise<T> {
  const data = await successfulReply(msg);
  if (!isReply(data))
    throw new Error("The extension sent an unexpected reply.");
  return data;
}

/** Tells the background worker to do something, throwing its error. */
export async function tellBackground(msg: ExtensionMessage): Promise<void> {
  await successfulReply(msg);
}
