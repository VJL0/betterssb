import type { ChatMessage } from "@workspace/shared/types";
import { postJson } from "./http";

/**
 * One advisor reply. `context` is only what the student chose to share
 * (audit, transcript, plan), as plain text.
 */
export async function askAdvisor(
  messages: ChatMessage[],
  context: string,
  signal?: AbortSignal,
): Promise<string> {
  const { response } = await postJson<{ response: string }>(
    "/chat/",
    { messages, context },
    { signal, errorMessage: "The advisor is unavailable right now." },
  );
  return response;
}
