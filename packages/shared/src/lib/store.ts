import { assignCourseColorOrder } from "./course-colors";
import type {
  AdvisorThread,
  LocalStore,
  StoreDocuments,
  StoreKey,
  TermPlan,
  UserSettings,
} from "../types/store";

const PLAN_KEY_PREFIX = "plan:";
const SINGLE_KEYS: ReadonlySet<string> = new Set([
  "settings",
  "audit",
  "transcript",
  "advisorThreads",
]);
const TERM_CODE = /^\d{6}$/;

/** chrome.storage.local keys for store documents, apart from the extension's own keys. */
export const EXTENSION_STORE_PREFIX = "betterssb:store:";

/** Settings before the student has saved any (the website and the popup). */
export const DEFAULT_SETTINGS: Omit<UserSettings, "updatedAt"> = {
  school: null,
  term: null,
  major: "",
  keyboardShortcuts: true,
  bannerOverlay: true,
};

/**
 * Saved settings over the defaults, so settings saved before a field existed
 * read that field's default.
 */
export function withSettingDefaults(saved: UserSettings | null): UserSettings {
  return { ...DEFAULT_SETTINGS, updatedAt: "", ...saved };
}

export function planKey(term: string): `plan:${string}` {
  return `${PLAN_KEY_PREFIX}${term}`;
}

export function isStoreKey(key: unknown): key is StoreKey {
  if (typeof key !== "string") return false;
  if (SINGLE_KEYS.has(key)) return true;
  return (
    key.startsWith(PLAN_KEY_PREFIX) &&
    TERM_CODE.test(key.slice(PLAN_KEY_PREFIX.length))
  );
}

function newerOf<T>(a: T, b: T, stamp: (doc: T) => string): T {
  return stamp(b) > stamp(a) ? b : a;
}

function mergePlans(a: TermPlan, b: TermPlan): TermPlan {
  const byCrn = new Map(a.sections.map((s) => [s.crn, s]));
  for (const section of b.sections) {
    if (!byCrn.has(section.crn)) byCrn.set(section.crn, section);
  }
  const sections = [...byCrn.values()].sort((x, y) =>
    x.addedAt.localeCompare(y.addedAt),
  );
  const courseIds = [...new Set(sections.map((s) => s.courseId))];
  const coursesById = new Map(a.courses.map((c) => [c.id, c]));
  for (const course of b.courses) {
    if (!coursesById.has(course.id)) coursesById.set(course.id, course);
  }
  return {
    ...newerOf(a, b, (p) => p.updatedAt),
    sections,
    courses: [...coursesById.values()],
    colorOrder: assignCourseColorOrder(courseIds, {
      ...b.colorOrder,
      ...a.colorOrder,
    }),
  };
}

function mergeThreads(a: AdvisorThread[], b: AdvisorThread[]): AdvisorThread[] {
  const byId = new Map(a.map((t) => [t.id, t]));
  for (const thread of b) {
    const existing = byId.get(thread.id);
    byId.set(
      thread.id,
      existing ? newerOf(existing, thread, (t) => t.updatedAt) : thread,
    );
  }
  return [...byId.values()].sort((x, y) =>
    y.updatedAt.localeCompare(x.updatedAt),
  );
}

/**
 * Combines two copies of a document so nothing is lost: plans keep every
 * section (first copy wins on a shared CRN, colors stay put), advisor threads
 * are unioned, and single documents keep the newer copy.
 */
export function mergeDocuments<K extends StoreKey>(
  key: K,
  a: StoreDocuments[K],
  b: StoreDocuments[K],
): StoreDocuments[K] {
  if (key.startsWith(PLAN_KEY_PREFIX)) {
    return mergePlans(a as TermPlan, b as TermPlan) as StoreDocuments[K];
  }
  switch (key) {
    case "advisorThreads":
      return mergeThreads(
        a as AdvisorThread[],
        b as AdvisorThread[],
      ) as StoreDocuments[K];
    case "settings":
      return newerOf(
        a as StoreDocuments["settings"],
        b as StoreDocuments["settings"],
        (d) => d.updatedAt,
      ) as StoreDocuments[K];
    case "audit":
    case "transcript":
      return newerOf(
        a as { storedAt: string },
        b as { storedAt: string },
        (d) => d.storedAt,
      ) as StoreDocuments[K];
    default:
      return a;
  }
}

/** Copies every document from `from` into `to`, merging where both have one. */
export async function mergeStoreInto(
  from: Pick<LocalStore, "get" | "keys">,
  to: Pick<LocalStore, "get" | "set">,
): Promise<number> {
  let copied = 0;
  for (const key of await from.keys()) {
    const incoming = await from.get(key);
    if (incoming === null) continue;
    const existing = await to.get(key);
    await to.set(
      key,
      existing === null ? incoming : mergeDocuments(key, existing, incoming),
    );
    copied++;
  }
  return copied;
}
