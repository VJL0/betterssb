import { describe, expect, it } from "vitest";
import type {
  AdvisorThread,
  LocalStore,
  PlannedSection,
  StoreDocuments,
  StoreKey,
  TermPlan,
  UserSettings,
} from "../types/store";
import {
  DEFAULT_SETTINGS,
  isStoreKey,
  mergeDocuments,
  mergeStoreInto,
  planKey,
  withSettingDefaults,
} from "./store";
import { DEFAULT_PLAN_PREFERENCES } from "./plan-optimizer";

function section(
  crn: string,
  courseId: string,
  addedAt: string,
): PlannedSection {
  return {
    crn,
    courseId,
    courseCode: courseId,
    section: "001",
    title: "",
    credits: 3,
    scheduleType: "Lecture",
    instructor: "TBA",
    meetings: [],
    addedAt,
  };
}

function plan(
  sections: PlannedSection[],
  colorOrder: Record<string, number>,
  updatedAt: string,
): TermPlan {
  return {
    term: "202703",
    termDescription: "2027 Spring",
    sections,
    courses: [],
    colorOrder,
    updatedAt,
  };
}

describe("withSettingDefaults", () => {
  it("fills fields saved before they existed", () => {
    const older: Partial<UserSettings> = {
      ...DEFAULT_SETTINGS,
      term: "202703",
      updatedAt: "2026-10-01T00:00:00.000Z",
    };
    delete older.bannerOverlay;
    expect(withSettingDefaults(older as never)).toMatchObject({
      term: "202703",
      bannerOverlay: true,
    });
  });

  it("keeps a saved choice", () => {
    expect(
      withSettingDefaults({
        ...DEFAULT_SETTINGS,
        bannerOverlay: false,
        updatedAt: "",
      }).bannerOverlay,
    ).toBe(false);
  });

  it("uses the defaults before anything is saved", () => {
    expect(withSettingDefaults(null)).toEqual({
      ...DEFAULT_SETTINGS,
      updatedAt: "",
    });
  });
});

describe("isStoreKey", () => {
  it.each([
    "settings",
    "audit",
    "transcript",
    "advisorThreads",
    "planPreferences",
    "plan:202703",
  ])("accepts %s", (key) => expect(isStoreKey(key)).toBe(true));

  it.each(["plan:", "plan:2027", "plan:202703x", "betterssb:school", 42, null])(
    "rejects %s",
    (key) => expect(isStoreKey(key)).toBe(false),
  );

  it("builds plan keys", () => {
    expect(planKey("202703")).toBe("plan:202703");
  });
});

describe("mergeDocuments", () => {
  it("keeps the newer plan preferences", () => {
    const older = {
      ...DEFAULT_PLAN_PREFERENCES,
      creditsPerTerm: 12,
      updatedAt: "2026-10-01",
    };
    const newer = { ...older, creditsPerTerm: 18, updatedAt: "2026-10-02" };
    expect(mergeDocuments("planPreferences", older, newer)).toBe(newer);
    expect(mergeDocuments("planPreferences", newer, older)).toBe(newer);
  });

  it("keeps every planned section and the existing colors", () => {
    const here = plan(
      [
        section("1", "CIS2168", "2026-10-01"),
        section("2", "CIS2107", "2026-10-02"),
      ],
      { CIS2168: 0, CIS2107: 1 },
      "2026-10-02",
    );
    const there = plan(
      [
        section("2", "CIS2107", "2026-10-02"),
        section("3", "MATH2101", "2026-10-03"),
      ],
      { CIS2107: 0, MATH2101: 1 },
      "2026-10-03",
    );
    const merged = mergeDocuments("plan:202703", here, there);
    expect(merged.sections.map((s) => s.crn)).toEqual(["1", "2", "3"]);
    expect(merged.colorOrder).toEqual({ CIS2168: 0, CIS2107: 1, MATH2101: 2 });
    expect(merged.updatedAt).toBe("2026-10-03");
  });

  it("unions advisor threads, keeping the newer copy of each", () => {
    const thread = (id: string, updatedAt: string): AdvisorThread => ({
      id,
      title: id,
      messages: [],
      updatedAt,
    });
    const merged = mergeDocuments(
      "advisorThreads",
      [thread("a", "2026-10-01"), thread("b", "2026-10-05")],
      [thread("a", "2026-10-03"), thread("c", "2026-10-02")],
    );
    expect(merged.map((t) => [t.id, t.updatedAt])).toEqual([
      ["b", "2026-10-05"],
      ["a", "2026-10-03"],
      ["c", "2026-10-02"],
    ]);
  });

  it("keeps the newer single document", () => {
    const older = { audit: {} as never, storedAt: "2026-09-01" };
    const newer = { audit: {} as never, storedAt: "2026-10-12" };
    expect(mergeDocuments("audit", older, newer)).toBe(newer);
    expect(mergeDocuments("audit", newer, older)).toBe(newer);
  });
});

describe("mergeStoreInto", () => {
  function memoryStore(docs: Partial<Record<StoreKey, unknown>>) {
    const data = new Map(Object.entries(docs)) as Map<StoreKey, unknown>;
    const store: Pick<LocalStore, "get" | "set" | "keys"> = {
      get: async <K extends StoreKey>(key: K) =>
        (data.get(key) as StoreDocuments[K] | undefined) ?? null,
      set: async (key, value) => {
        data.set(key, value);
      },
      keys: async () => [...data.keys()],
    };
    return { store, data };
  }

  it("copies new documents and merges shared ones", async () => {
    const from = memoryStore({
      "plan:202703": plan(
        [section("3", "MATH2101", "2026-10-03")],
        { MATH2101: 0 },
        "2026-10-03",
      ),
      transcript: { transcript: { courses: [] }, storedAt: "2026-10-01" },
    });
    const to = memoryStore({
      "plan:202703": plan(
        [section("1", "CIS2168", "2026-10-01")],
        { CIS2168: 0 },
        "2026-10-01",
      ),
    });
    expect(await mergeStoreInto(from.store, to.store)).toBe(2);
    const merged = to.data.get("plan:202703") as TermPlan;
    expect(merged.sections.map((s) => s.crn)).toEqual(["1", "3"]);
    expect(to.data.has("transcript")).toBe(true);
  });
});
