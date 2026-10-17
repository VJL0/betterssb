import type { TranscriptCourse, TranscriptData } from "@workspace/shared/types";
import { postJson, requestJson } from "./http";

/** Parses pasted transcript text. The text isn't stored. */
export function parseTranscriptText(
  text: string,
  signal?: AbortSignal,
): Promise<TranscriptData> {
  return requestJson("/transcript/parse", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: text,
    signal,
    errorMessage: "Couldn't read that transcript.",
  });
}

/** Which of `required` (e.g. "CIS 1068") the completed courses satisfy. */
export function checkPrerequisites(
  completed: TranscriptCourse[],
  required: string[],
  signal?: AbortSignal,
): Promise<Record<string, boolean>> {
  return postJson(
    "/transcript/check-prereqs",
    { completed, required },
    { signal, errorMessage: "Couldn't check prerequisites." },
  );
}
