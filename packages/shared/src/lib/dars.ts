import type { Audit, Requirement } from "@workspace/api-client";

/** A requirement that is only explanatory text (DARS banners like WARNING, MAJOR, SUMMARY). */
export function isNoteOnly(req: Requirement): boolean {
  return !req.title && req.subrequirements.length === 0;
}

export function formatCredits(n: number | null | undefined): string {
  if (n == null) return "";
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** DARS puts degree-wide credit totals on a requirement in this category. */
const TOTAL_HOURS_CATEGORY = "Total_Hours";

export interface CreditTotals {
  earned: number;
  inProgress: number;
  /** Still needed after in-progress credits. */
  needed: number;
  total: number;
}

/** Degree credit totals from an audit, or null if the audit has none. */
export function creditTotals(audit: Audit): CreditTotals | null {
  const totals = audit.requirements.find(
    (r) => r.category === TOTAL_HOURS_CATEGORY,
  );
  const earned = totals?.earned?.credits;
  if (earned == null) return null;
  const inProgress = totals?.inProgress?.credits ?? 0;
  const needed = totals?.needs?.credits ?? 0;
  // DARS "needs" already subtracts in-progress credits.
  return { earned, inProgress, needed, total: earned + inProgress + needed };
}

export interface NeededRequirement {
  code: string;
  title: string;
  /** Credits still needed, when DARS says. */
  credits: number | null;
  /** Courses DARS lists as able to fill it. */
  options: string[];
}

/** Requirements still needed, in audit order, for placing in a plan. */
export function neededRequirements(audit: Audit): NeededRequirement[] {
  return audit.requirements
    .filter(
      (r) =>
        r.status === "incomplete" &&
        !isNoteOnly(r) &&
        r.category !== TOTAL_HOURS_CATEGORY,
    )
    .map((r) => ({
      code: r.code,
      title: r.title || r.code,
      credits: r.needs?.credits ?? null,
      options: [
        ...new Set(
          r.subrequirements
            .filter((s) => s.status === "incomplete")
            .flatMap((s) => s.selectFrom),
        ),
      ],
    }));
}
