import { assignCourseColorOrder } from "./course-colors";
import { isRecord } from "./guards";
import type {
  AdvisorThread,
  BannerConnection,
  LocalStore,
  StoreDocument,
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
  "planPreferences",
]);
const TERM_CODE = /^\d{6}$/;

/** chrome.storage.local keys for store documents, apart from the extension's own keys. */
export const EXTENSION_STORE_PREFIX = "betterssb:store:";

/** Settings before the student has saved any (the website and the popup). */
export const DEFAULT_SETTINGS: Omit<UserSettings, "updatedAt"> = {
  term: null,
  major: "",
  startTerm: null,
  program: null,
  keyboardShortcuts: true,
  bannerOverlay: true,
};

/** The saved settings, or the defaults before the student has saved any. */
export function settingsOrDefaults(saved: UserSettings | null): UserSettings {
  return saved ?? { ...DEFAULT_SETTINGS, updatedAt: "" };
}

export function planKey(term: string): `plan:${string}` {
  return `${PLAN_KEY_PREFIX}${term}`;
}

export function isPlanKey(key: string): key is `plan:${string}` {
  return (
    key.startsWith(PLAN_KEY_PREFIX) &&
    TERM_CODE.test(key.slice(PLAN_KEY_PREFIX.length))
  );
}

export function isStoreKey(key: unknown): key is StoreKey {
  if (typeof key !== "string") return false;
  return SINGLE_KEYS.has(key) || isPlanKey(key);
}

/**
 * Whether `value` has the outline of the document stored at `key`: a plan's
 * section and course lists, the thread list, or an object for the rest.
 */
export function isStoreDocument<K extends StoreKey>(
  key: K,
  value: unknown,
): value is StoreDocuments[K] {
  if (isPlanKey(key)) {
    return (
      isRecord(value) &&
      Array.isArray(value.sections) &&
      Array.isArray(value.courses)
    );
  }
  return key === "advisorThreads" ? Array.isArray(value) : isRecord(value);
}

const BANNER_CONNECTIONS: ReadonlySet<unknown> = new Set<BannerConnection>([
  "connected",
  "signed-out",
  "not-connected",
]);

export function isBannerConnection(value: unknown): value is BannerConnection {
  return BANNER_CONNECTIONS.has(value);
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
): StoreDocuments[K];
// TypeScript can't tie a narrowed `key` to the documents' type, so the body
// narrows the documents by their own fields; anything unexpected keeps `a`.
export function mergeDocuments(
  key: StoreKey,
  a: StoreDocument,
  b: StoreDocument,
): StoreDocument {
  if (isPlanKey(key)) {
    return "sections" in a && "sections" in b ? mergePlans(a, b) : a;
  }
  switch (key) {
    case "advisorThreads":
      return Array.isArray(a) && Array.isArray(b) ? mergeThreads(a, b) : a;
    case "settings":
    case "planPreferences":
      return "updatedAt" in a && "updatedAt" in b
        ? newerOf<StoreDocument & { updatedAt: string }>(
            a,
            b,
            (d) => d.updatedAt,
          )
        : a;
    case "audit":
    case "transcript":
      return "storedAt" in a && "storedAt" in b
        ? newerOf<StoreDocument & { storedAt: string }>(a, b, (d) => d.storedAt)
        : a;
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
