import { sendMessage, type ExtensionMessage } from "@/lib/messaging";

/** Asks the background worker and returns its data, or throws its error. */
export async function askBackground<T>(
  type: ExtensionMessage["type"],
  payload: unknown = {},
): Promise<T> {
  const response = await sendMessage({ type, payload });
  if (!response?.success) {
    throw new Error(response?.error ?? "The extension didn't respond.");
  }
  return response.data as T;
}
