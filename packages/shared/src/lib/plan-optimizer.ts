/**
 * "Optimize plan": places what the audit still needs into the student's
 * terms. A course goes after the courses it needs first, and among the
 * courses ready for a term the student's priority comes first, then the
 * courses that hold up the longest chain of others, then those that unlock
 * the most.
 */
import type {
  PlanPreferences,
  PlanPriority,
  PlannedCourse,
  TermPlan,
} from "../types/store";
import type { NeededPart, NeededRequirement } from "./dars";
import { addCourse, courseKey, emptyPlan, splitCourseCode } from "./plan";
import { entryCredits, termEntries } from "./planner";
import { nextTerms, splitTempleTerm, templeTermName } from "./terms";

export const DEFAULT_PLAN_PREFERENCES: Omit<PlanPreferences, "updatedAt"> = {
  priorities: {},
  choices: {},
  creditsPerTerm: 15,
  includeSummers: false,
};

/** The most credits one course carries; a requirement needing more is several courses. */
const MAX_COURSE_CREDITS = 4;
/** Credits assumed for a course when the audit doesn't say. */
const DEFAULT_COURSE_CREDITS = 3;
/** Terms the optimizer may add after the last one in the plan. */
const MAX_NEW_TERMS = 12;
const SUMMER_SEASONS: ReadonlySet<string> = new Set(["20", "26"]);
const PRIORITY_RANK: Record<PlanPriority, number> = {
  high: 0,
  normal: 1,
  low: 2,
  skip: 3,
};

export type NewPlannedCourse = Omit<PlannedCourse, "id" | "addedAt">;

/** A course the optimizer places, with what ranks it. */
export interface OptimizerCourse {
  /** Unique within a run: the course key, or a placeholder's part and slot. */
  key: string;
  /** The requirement part it fills (see `requirementParts`). */
  part: string;
  course: NewPlannedCourse;
  priority: PlanPriority;
  /** Other courses in the run that need this one first, directly or not. */
  unlocks: number;
  /** The longest chain of courses in the run that starts with this one. */
  chain: number;
  /** Keys of courses in the run to take first. */
  after: string[];
  /** A term this one must come after, for a prerequisite already planned there. */
  afterTerm: string | null;
}

export interface Placement {
  term: string;
  termDescription: string;
  course: OptimizerCourse;
}

export interface OptimizeResult {
  placements: Placement[];
  /** Terms the placements add to the plan, in order. */
  newTerms: { code: string; name: string }[];
  /** Courses with no term: their prerequisites loop, or the terms ran out. */
  unplaced: OptimizerCourse[];
}

/** What the optimizer reads from a course's Bulletin entry. */
export interface CatalogCourse {
  title: string;
  credits: number | null;
  /** Course codes its prerequisites name. */
  prerequisites: readonly string[];
}

export interface OptimizeInput {
  /** Requirements the audit still needs and no term has yet. */
  requirements: readonly NeededRequirement[];
  /** Every term's plan. */
  plans: readonly TermPlan[];
  /** The first term that can take courses, a Temple term code. */
  firstTerm: string;
  /** A course's Bulletin entry, or null when it isn't known (yet). */
  catalog: (code: string) => CatalogCourse | null;
  /** Course keys the audit has, taken or in progress. */
  completed: ReadonlySet<string>;
  preferences: Omit<PlanPreferences, "updatedAt">;
}

function isSummer(term: string): boolean {
  const season = splitTempleTerm(term)?.season;
  return season !== undefined && SUMMER_SEASONS.has(season);
}

/** A DARS option as a course code ("CIS 2168"), or null for wildcards like "CIS 4@". */
function optionCode(option: string): string | null {
  const parts = splitCourseCode(option);
  return parts ? `${parts.subject} ${parts.courseNumber}` : null;
}

function prerequisitesOf(
  code: string,
  input: OptimizeInput,
): readonly string[] {
  return input.catalog(code)?.prerequisites ?? [];
}

/** A part of a requirement as the optimizer plans it. */
export interface PlanPart extends Omit<NeededPart, "options"> {
  /** "CISS.TBS#1": the requirement code and the part's place in it. */
  key: string;
  /** The course codes it lists; ranges and wildcards are left out. */
  options: string[];
}

/**
 * A requirement's parts, each planned on its own. A requirement DARS lists no
 * parts for is one part, and a lone part with no count takes the requirement's.
 */
export function requirementParts(requirement: NeededRequirement): PlanPart[] {
  const parts: NeededPart[] =
    requirement.parts.length > 0
      ? requirement.parts
      : [{ ...requirement, title: requirement.title }];
  return parts.map((part, index) => {
    const inherit =
      parts.length === 1 && part.credits === null && part.courses === null;
    return {
      key: `${requirement.code}#${index}`,
      title: part.title || requirement.title,
      credits: inherit ? requirement.credits : part.credits,
      courses: inherit ? requirement.courses : part.courses,
      options: [...new Set(part.options.flatMap((o) => optionCode(o) ?? []))],
    };
  });
}

/** One decimal place, as credits are written. */
function roundCredits(credits: number): number {
  return Math.round(credits * 10) / 10;
}

/**
 * The credits of each course a part still takes. Credits without a course
 * count become standard courses and the remainder: 22 credits of electives
 * are seven 3-credit courses and a 1-credit one.
 */
function slotCredits(part: PlanPart): number[] {
  const { credits, courses } = part;
  if (courses) {
    const each =
      credits === null
        ? DEFAULT_COURSE_CREDITS
        : roundCredits(credits / courses);
    return Array.from({ length: courses }, () => each);
  }
  if (credits === null) return [DEFAULT_COURSE_CREDITS];
  if (credits <= MAX_COURSE_CREDITS) return [credits];
  const slots: number[] = [];
  for (
    let left = credits;
    left > 0;
    left = roundCredits(left - DEFAULT_COURSE_CREDITS)
  ) {
    slots.push(Math.min(DEFAULT_COURSE_CREDITS, left));
  }
  return slots;
}

/** Each planned course's term, by course key. */
function plannedTerms(plans: readonly TermPlan[]): Map<string, string> {
  const terms = new Map<string, string>();
  for (const plan of plans) {
    for (const entry of termEntries(plan)) {
      if (entry.code && !terms.has(entry.key)) terms.set(entry.key, plan.term);
    }
  }
  return terms;
}

type Candidate = Omit<
  OptimizerCourse,
  "unlocks" | "chain" | "after" | "afterTerm"
>;

/**
 * The courses a part's slots get: the student's pick, then the options whose
 * prerequisites are furthest along, then placeholders named after the part
 * when options run out.
 */
function partCourses(
  requirement: NeededRequirement,
  part: PlanPart,
  input: OptimizeInput,
  unavailable: Set<string>,
): Candidate[] {
  const priority = input.preferences.priorities[requirement.code] ?? "normal";
  const missing = (code: string) =>
    prerequisitesOf(code, input).filter(
      (p) => !input.completed.has(courseKey(p)),
    ).length;
  const choice = input.preferences.choices[part.key];
  const codes = part.options
    .filter((code) => !unavailable.has(courseKey(code)))
    .map((code, index) => ({ code, index }))
    .sort(
      (a, b) =>
        Number(b.code === choice) - Number(a.code === choice) ||
        missing(a.code) - missing(b.code) ||
        a.index - b.index,
    )
    .map((o) => o.code);

  return slotCredits(part).map((credits, slot) => {
    const code = codes[slot] ?? null;
    if (code) unavailable.add(courseKey(code));
    const entry = code ? input.catalog(code) : null;
    return {
      key: code ? courseKey(code) : `${part.key}:${slot}`,
      part: part.key,
      course: {
        code,
        title: entry?.title ?? part.title,
        credits: entry?.credits ?? credits,
        requirement: requirement.code,
      },
      priority,
    };
  });
}

/** Candidates linked by prerequisites, with how much each one holds up. */
function withPrerequisites(
  candidates: Candidate[],
  input: OptimizeInput,
  planned: Map<string, string>,
): OptimizerCourse[] {
  const keys = new Set(candidates.map((c) => c.key));
  const linked = candidates.map((candidate) => {
    const needs = candidate.course.code
      ? prerequisitesOf(candidate.course.code, input).map(courseKey)
      : [];
    const plannedTerms = needs.flatMap((k) => planned.get(k) ?? []).sort();
    return {
      ...candidate,
      after: [
        ...new Set(needs.filter((k) => keys.has(k) && k !== candidate.key)),
      ],
      afterTerm: plannedTerms.at(-1) ?? null,
      unlocks: 0,
      chain: 1,
    };
  });

  const dependents = new Map<string, string[]>();
  for (const course of linked) {
    for (const before of course.after) {
      dependents.set(before, [...(dependents.get(before) ?? []), course.key]);
    }
  }
  const chains = new Map<string, number>();
  // A course in a prerequisite loop counts as the end of its chain.
  const chainFrom = (key: string, visiting: Set<string>): number => {
    const known = chains.get(key);
    if (known !== undefined) return known;
    if (visiting.has(key)) return 0;
    visiting.add(key);
    const next = (dependents.get(key) ?? []).map((k) => chainFrom(k, visiting));
    visiting.delete(key);
    const chain = 1 + Math.max(0, ...next);
    chains.set(key, chain);
    return chain;
  };
  const unlocked = (key: string): number => {
    const seen = new Set<string>();
    const queue = [...(dependents.get(key) ?? [])];
    while (queue.length > 0) {
      const next = queue.pop()!;
      if (seen.has(next) || next === key) continue;
      seen.add(next);
      queue.push(...(dependents.get(next) ?? []));
    }
    return seen.size;
  };
  return linked.map((course) => ({
    ...course,
    chain: chainFrom(course.key, new Set()),
    unlocks: unlocked(course.key),
  }));
}

/** The order courses ready for the same term are placed in. */
function compareCourses(a: OptimizerCourse, b: OptimizerCourse): number {
  return (
    PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
    b.chain - a.chain ||
    b.unlocks - a.unlocks ||
    courseLevel(a) - courseLevel(b)
  );
}

/** A course's number ("2168"), so lower-level courses go first; placeholders last. */
function courseLevel(course: OptimizerCourse): number {
  const code = course.course.code;
  const number = code
    ? Number.parseInt(splitCourseCode(code)!.courseNumber, 10)
    : NaN;
  return Number.isNaN(number) ? Number.MAX_SAFE_INTEGER : number;
}

/** The courses an optimizer run places, ranked, before any term is chosen. */
export function optimizerCourses(input: OptimizeInput): OptimizerCourse[] {
  const planned = plannedTerms(input.plans);
  const unavailable = new Set([...input.completed, ...planned.keys()]);
  const candidates = input.requirements
    .filter((r) => input.preferences.priorities[r.code] !== "skip")
    .flatMap((r) =>
      requirementParts(r).flatMap((part) =>
        partCourses(r, part, input, unavailable),
      ),
    );
  return withPrerequisites(candidates, input, planned).sort(compareCourses);
}

/** Places every course an audit still needs into terms, adding terms when the plan runs out. */
export function optimizePlan(input: OptimizeInput): OptimizeResult {
  const { creditsPerTerm, includeSummers } = input.preferences;
  const usable = (term: string) => includeSummers || !isSummer(term);
  const existing = new Map(input.plans.map((p) => [p.term, p]));
  const lastPlanned = [...existing.keys(), input.firstTerm].sort().at(-1)!;

  let remaining = optimizerCourses(input);
  const placedIn = new Map<string, string>();
  const placements: Placement[] = [];
  const newTerms: OptimizeResult["newTerms"] = [];
  let beyondPlan = 0;

  // Every term from the first on, including ones the plan skipped.
  for (
    let code: string | undefined = input.firstTerm;
    code && remaining.length > 0;
    code = nextTerms(code, 1)[0]
  ) {
    if (!usable(code)) continue;
    const plan = existing.get(code);
    const name = plan?.termDescription ?? templeTermName(code);
    if (!name) break;
    const pastPlan = code > lastPlanned;
    if (pastPlan && ++beyondPlan > MAX_NEW_TERMS) break;
    const term = code;
    const ready = remaining.filter(
      (c) =>
        c.after.every((k) => (placedIn.get(k) ?? term) < term) &&
        (c.afterTerm === null || c.afterTerm < term),
    );
    // Past the plan's own terms nothing new becomes ready: what's left loops.
    if (ready.length === 0 && pastPlan) break;
    let load = plan ? entryCredits(termEntries(plan)) : 0;
    let placedHere = 0;
    for (const course of ready) {
      const credits = course.course.credits ?? DEFAULT_COURSE_CREDITS;
      if (load > 0 && load + credits > creditsPerTerm) continue;
      load += credits;
      placedHere++;
      placedIn.set(course.key, term);
      placements.push({ term, termDescription: name, course });
    }
    if (!plan && placedHere > 0) newTerms.push({ code: term, name });
    remaining = remaining.filter((c) => !placedIn.has(c.key));
  }
  return { placements, newTerms, unplaced: remaining };
}

/** The plans an optimizer run changes or adds, with its courses in them. */
export function applyOptimization(
  plans: readonly TermPlan[],
  result: OptimizeResult,
  now: string,
): TermPlan[] {
  const changed = new Map<string, TermPlan>();
  const planFor = (code: string, name: string) =>
    changed.get(code) ??
    plans.find((p) => p.term === code) ??
    emptyPlan(code, name);
  for (const { term, termDescription, course } of result.placements) {
    const plan = planFor(term, termDescription);
    changed.set(
      term,
      addCourse(
        plan,
        { ...course.course, id: crypto.randomUUID(), addedAt: now },
        now,
      ),
    );
  }
  return [...changed.values()];
}
