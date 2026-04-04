import type { AutoRegBatchResultRecord } from "@/lib/auto-reg-batch-result";
import type { SSBRegPlanHeader, SSBTerm } from "@/types/ssb";

/** Merge API terms with any term codes only present on plans. */
export function mergeTermsFromPlans(
  terms: SSBTerm[],
  plans: SSBRegPlanHeader[],
): SSBTerm[] {
  const byCode = new Map(terms.map((t) => [t.code, t]));
  for (const p of plans) {
    if (!byCode.has(p.term)) {
      byCode.set(p.term, { code: p.term, description: p.term });
    }
  }
  return Array.from(byCode.values()).sort((a, b) =>
    a.code.localeCompare(b.code),
  );
}

export function parseManualCrns(raw: string): string[] {
  return raw
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function crnsFromPlanHeader(plan: SSBRegPlanHeader | null): string[] {
  if (!plan?.planCourses?.length) return [];
  return plan.planCourses
    .map((c) => String(c.courseReferenceNumber ?? "").trim())
    .filter((c) => c.length > 0);
}

/** Sorted fingerprint for comparing two CRN lists as strings. */
export function normalizeCrnList(raw: string): string {
  return parseManualCrns(raw).slice().sort().join(",");
}

/** Resolved term row for a Banner term code, if present. */
export function getTermByCode(
  terms: SSBTerm[],
  termCode: string,
): SSBTerm | undefined {
  return terms.find((t) => t.code === termCode);
}

export function getPlansForTerm(
  plans: SSBRegPlanHeader[] | undefined | null,
  termCode: string,
): SSBRegPlanHeader[] {
  if (!plans?.length || !termCode) return [];
  return plans.filter((p) => p.term === termCode);
}

export function findPlanById(
  plans: SSBRegPlanHeader[],
  planIdStr: string,
): SSBRegPlanHeader | null {
  const id = parseInt(planIdStr, 10);
  if (Number.isNaN(id)) return null;
  return plans.find((p) => p.id === id) ?? null;
}

/** If the stored code is missing or not in the list, use the first term. */
export function resolveTermCodeToValid(
  termCode: string,
  terms: SSBTerm[],
): string {
  if (terms.length === 0) return termCode;
  if (termCode && getTermByCode(terms, termCode)) return termCode;
  return terms[0].code;
}

/** Empty string if no plans; otherwise a valid id from `plansForTerm`. */
export function resolvePlanIdToValid(
  planIdStr: string,
  plansForTerm: SSBRegPlanHeader[],
): string {
  if (plansForTerm.length === 0) return "";
  const n = parseInt(planIdStr, 10);
  if (!Number.isNaN(n) && plansForTerm.some((p) => p.id === n)) {
    return planIdStr;
  }
  return String(plansForTerm[0].id);
}

export function parseAutoRegBatchResultJson(
  raw: string,
): AutoRegBatchResultRecord | null {
  const t = raw.trim();
  if (!t) return null;
  try {
    return JSON.parse(t) as AutoRegBatchResultRecord;
  } catch {
    return null;
  }
}

export function hasScheduledRunAt(scheduledRunAt: string): boolean {
  return scheduledRunAt.trim().length > 0;
}

export function isPlanModeSectionsOk(
  plansForTerm: SSBRegPlanHeader[],
  selectedPlan: SSBRegPlanHeader | null,
  planCrns: string[],
): boolean {
  return (
    plansForTerm.length > 0 &&
    selectedPlan !== null &&
    planCrns.length > 0
  );
}
