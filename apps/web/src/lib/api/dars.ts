import type { Audit } from "@workspace/shared/types/dars";
import { requestJson } from "./http";

/** Parses an already-fetched DARS audit page (from the extension or an uploaded file). */
export function parseAuditHtml(
  html: string,
  signal?: AbortSignal,
): Promise<Audit> {
  return requestJson("/dars/audits/parse", {
    method: "POST",
    headers: { "Content-Type": "text/html" },
    body: html,
    signal,
    errorMessage: "Couldn't read the audit.",
  });
}

/** Reads a saved printer-friendly DARS audit file and parses it. */
export async function runFromFile(file: File): Promise<Audit> {
  return parseAuditHtml(await file.text());
}
