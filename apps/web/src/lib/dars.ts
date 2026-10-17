import type { Audit } from "@workspace/shared/types/dars";

async function detail(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => null)) as {
    detail?: unknown;
  } | null;
  return typeof body?.detail === "string" ? body.detail : fallback;
}

/** Parses an already-fetched DARS audit page (from the extension or an uploaded file). */
export async function parseAuditHtml(
  html: string,
  signal?: AbortSignal,
): Promise<Audit> {
  const res = await fetch("/api/dars/audits/parse", {
    method: "POST",
    headers: { "Content-Type": "text/html" },
    body: html,
    signal,
  });
  if (res.ok) return (await res.json()) as Audit;
  throw new Error(
    await detail(
      res,
      res.status === 422
        ? "That file doesn't look like a DARS audit page."
        : `Couldn't read the audit (HTTP ${res.status}).`,
    ),
  );
}

/** Reads a saved printer-friendly DARS audit file and parses it. */
export async function runFromFile(file: File): Promise<Audit> {
  return parseAuditHtml(await file.text());
}
