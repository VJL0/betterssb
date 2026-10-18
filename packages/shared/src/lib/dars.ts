import type { Requirement } from "../types/dars";

/** A requirement that is only explanatory text (DARS banners like WARNING, MAJOR, SUMMARY). */
export function isNoteOnly(req: Requirement): boolean {
  return !req.title && req.subrequirements.length === 0;
}

export function formatCredits(n: number | null | undefined): string {
  if (n == null) return "";
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
