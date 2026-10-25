/**
 * The semester planner's view of term plans: one entry per course in a term,
 * and credit totals that don't count a course the audit already has.
 */
import type { PlannedCourse, TermPlan } from "../types/store";
import { addCourse, courseKey, replaceSections } from "./plan";
import type { Audit } from "@workspace/api-client";
import type { CreditTotals } from "./dars";

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

/** Whether a term already has a course, planned or with sections. */
export function hasCourse(plan: TermPlan, code: string): boolean {
  const key = courseKey(code);
  return termEntries(plan).some((e) => e.key === key);
}

/** The Bulletin's credits ("3", "1-4", "1 or 2") as the fewest a course can carry. */
export function catalogCredits(credits: string): number | null {
  const first = /\d+(?:\.\d+)?/.exec(credits);
  return first ? Number(first[0]) : null;
}

/**
 * An entry as a planned course: its own course entry when it has one, or one
 * made from its sections, which belong to their term and can't move with it.
 */
function entryAsCourse(
  plan: TermPlan,
  entry: TermEntry,
  now: string,
): PlannedCourse {
  const planned = plan.courses.find(
    (c) => (c.code ? courseKey(c.code) : c.id) === entry.key,
  );
  return (
    planned ?? {
      id: crypto.randomUUID(),
      code: entry.code,
      title: entry.title,
      credits: entry.credits,
      requirement: entry.requirement,
      addedAt: now,
    }
  );
}

/**
 * Moves a course from one term to another. Its sections stay behind, since a
 * CRN is only good for its own term. Null when the course isn't in `from` or
 * `to` already has it.
 */
export function moveEntry(
  from: TermPlan,
  to: TermPlan,
  key: string,
  now: string,
): { from: TermPlan; to: TermPlan } | null {
  const entry = termEntries(from).find((e) => e.key === key);
  if (!entry || termEntries(to).some((e) => e.key === key)) return null;
  return {
    from: removeEntry(from, key, now),
    to: addCourse(to, entryAsCourse(from, entry, now), now),
  };
}

/**
 * The plan under another term, such as Fall 2027 moved to Spring 2028. Every
 * course comes along as a planned course; sections stay behind with their term.
 */
export function retermPlan(
  plan: TermPlan,
  term: string,
  termDescription: string,
  now: string,
): TermPlan {
  const courses = termEntries(plan).map((e) => entryAsCourse(plan, e, now));
  return replaceSections({ ...plan, term, termDescription, courses }, [], now);
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

export interface ProjectedFinish {
  /** Credits counted: earned, in progress, and planned beyond the audit. */
  counted: number;
  onTrack: boolean;
  /** Credits still to place in a term when not on track. */
  shortBy: number;
  /** The last term with anything planned. */
  lastTerm: string | null;
}

/** Whether the plan covers the degree's credits, and when it would finish. */
export function projectedFinish(
  totals: CreditTotals,
  plans: readonly TermPlan[],
  counted: ReadonlySet<string>,
): ProjectedFinish {
  const total =
    totals.earned + totals.inProgress + plannedCredits(plans, counted);
  const last = [...plans].reverse().find((p) => termEntries(p).length > 0);
  return {
    counted: total,
    onTrack: total >= totals.total,
    shortBy: Math.max(totals.total - total, 0),
    lastTerm: last?.termDescription ?? null,
  };
}
