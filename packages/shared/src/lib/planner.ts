/**
 * The semester planner's view of term plans: one entry per course in a term,
 * and credit totals that don't count a course the audit already has.
 */
import type { Audit } from "../types/dars";
import type { TermPlan } from "../types/store";
import { courseKey, replaceSections } from "./plan";

/** Full-time is 12 credits; over 18 needs approval at Temple. */
export const PART_TIME_BELOW = 12;
export const APPROVAL_ABOVE = 18;

export interface TermEntry {
  /** The course key ("CIS2168"), or a placeholder's id. */
  key: string;
  /** "CIS 2168", or null for a placeholder like "CIS elective". */
  code: string | null;
  title: string;
  credits: number | null;
  /** The audit requirement it fills, if any. */
  requirement: string | null;
  /** True when it has sections in the plan, not only a course entry. */
  scheduled: boolean;
}

/** One entry per course in a term: courses with sections first, then planned courses. */
export function termEntries(plan: TermPlan): TermEntry[] {
  const entries = new Map<string, TermEntry>();
  for (const section of plan.sections) {
    const existing = entries.get(section.courseId);
    if (existing) {
      existing.credits = Math.max(existing.credits ?? 0, section.credits ?? 0);
      continue;
    }
    entries.set(section.courseId, {
      key: section.courseId,
      code: section.courseCode,
      title: section.title,
      credits: section.credits,
      requirement: null,
      scheduled: true,
    });
  }
  for (const course of plan.courses) {
    const key = course.code ? courseKey(course.code) : course.id;
    const existing = entries.get(key);
    if (existing) {
      existing.requirement ??= course.requirement;
      continue;
    }
    entries.set(key, {
      key,
      code: course.code,
      title: course.title,
      credits: course.credits,
      requirement: course.requirement,
      scheduled: false,
    });
  }
  return [...entries.values()];
}

export function entryCredits(entries: readonly TermEntry[]): number {
  return entries.reduce((sum, e) => sum + (e.credits ?? 0), 0);
}

/** Course keys the audit lists, taken or in progress. */
export function auditCourseKeys(audit: Audit): Set<string> {
  return new Set(
    audit.requirements.flatMap((r) =>
      r.subrequirements.flatMap((s) =>
        s.courses.map((c) => courseKey(c.course)),
      ),
    ),
  );
}

/**
 * Credits planned across terms that the audit doesn't already count. A
 * course in both a plan and the audit (in progress this term) counts once.
 */
export function plannedCredits(
  plans: readonly TermPlan[],
  counted: ReadonlySet<string>,
): number {
  return plans.reduce(
    (sum, plan) =>
      sum +
      entryCredits(
        termEntries(plan).filter((e) => !e.code || !counted.has(e.key)),
      ),
    0,
  );
}

/** Requirement codes that already have a planned course in some term. */
export function placedRequirements(plans: readonly TermPlan[]): Set<string> {
  return new Set(
    plans.flatMap((p) =>
      p.courses.flatMap((c) => (c.requirement ? [c.requirement] : [])),
    ),
  );
}

/** Takes a course out of a term: its sections and its course entry. */
export function removeEntry(
  plan: TermPlan,
  key: string,
  now: string,
): TermPlan {
  const courses = plan.courses.filter(
    (c) => (c.code ? courseKey(c.code) : c.id) !== key,
  );
  const sections = plan.sections.filter((s) => s.courseId !== key);
  return replaceSections({ ...plan, courses }, sections, now);
}
