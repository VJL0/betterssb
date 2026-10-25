import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TermPlan, UserSettings } from "@workspace/shared/types/store";
import { installFakeBridge } from "../../test/fake-bridge";
import { getBannerConnection } from "../extension";
import { extensionStore } from "./extension-store";
import { IndexedDbStore } from "./indexeddb-store";
import { openStore } from "./open-store";

const SETTINGS: UserSettings = {
  term: "202703",
  major: "",
  startTerm: null,
  program: null,
  keyboardShortcuts: true,
  bannerOverlay: true,
  updatedAt: "2026-10-17T00:00:00.000Z",
};

function plan(crns: string[], updatedAt: string): TermPlan {
  return {
    term: "202703",
    termDescription: "2027 Spring",
    sections: crns.map((crn, i) => ({
      crn,
      courseId: `CIS${crn}`,
      courseCode: `CIS ${crn}`,
      section: "001",
      title: "",
      credits: 3,
      scheduleType: "Lecture",
      instructor: "TBA",
      meetings: [],
      addedAt: `2026-10-0${i + 1}`,
    })),
    courses: [],
    colorOrder: {},
    updatedAt,
  };
}

beforeEach(() => {
  // A fresh, empty IndexedDB for every test.
  vi.stubGlobal("indexedDB", new IDBFactory());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("IndexedDbStore", () => {
  it("saves, reads, lists and deletes documents", async () => {
    const store = new IndexedDbStore();
    expect(await store.get("settings")).toBeNull();
    await store.set("settings", SETTINGS);
    await store.set("plan:202703", plan(["1"], "2026-10-01"));
    expect(await store.get("settings")).toEqual(SETTINGS);
    expect((await store.keys()).sort()).toEqual(["plan:202703", "settings"]);
    await store.delete("settings");
    expect(await store.keys()).toEqual(["plan:202703"]);
  });

  it("tells subscribers which document changed", async () => {
    const store = new IndexedDbStore();
    const changed: string[] = [];
    const unsubscribe = store.subscribe((key) => changed.push(key));
    await store.set("audit", { audit: {} as never, storedAt: "2026-10-12" });
    await store.delete("audit");
    unsubscribe();
    await store.set("settings", SETTINGS);
    expect(changed).toEqual(["audit", "audit"]);
  });

  it("clears everything", async () => {
    const store = new IndexedDbStore();
    await store.set("settings", SETTINGS);
    await store.clear();
    expect(await store.keys()).toEqual([]);
  });
});

describe("extensionStore", () => {
  it("reads and writes the extension's documents through the bridge", async () => {
    const bridge = installFakeBridge();
    try {
      await extensionStore.set("settings", SETTINGS);
      expect(bridge.data.get("settings")).toEqual(SETTINGS);
      expect(await extensionStore.get("settings")).toEqual(SETTINGS);
      expect(await extensionStore.keys()).toEqual(["settings"]);
    } finally {
      bridge.uninstall();
    }
  });

  it("hears changes made in the extension", async () => {
    const bridge = installFakeBridge();
    const heard = new Promise((resolve) => {
      const unsubscribe = extensionStore.subscribe((key) => {
        unsubscribe();
        resolve(key);
      });
    });
    bridge.emitChange("plan:202703");
    await expect(heard).resolves.toBe("plan:202703");
    bridge.uninstall();
  });
});

describe("getBannerConnection", () => {
  it("is not connected without the extension", async () => {
    await expect(getBannerConnection()).resolves.toBe("not-connected");
  });

  it("asks the extension when it's installed", async () => {
    const bridge = installFakeBridge({ banner: "signed-out" });
    await expect(getBannerConnection()).resolves.toBe("signed-out");
    bridge.uninstall();
  });
});

describe("openStore", () => {
  it("uses IndexedDB without the extension", async () => {
    const opened = await openStore(new IndexedDbStore());
    expect(opened.location).toBe("browser");
  });

  it("moves guest data into the extension once it's installed", async () => {
    const browserStore = new IndexedDbStore();
    await browserStore.set("plan:202703", plan(["2"], "2026-10-02"));
    await browserStore.set("settings", SETTINGS);
    const bridge = installFakeBridge({
      documents: { "plan:202703": plan(["1"], "2026-10-01") },
    });
    try {
      const opened = await openStore(browserStore);
      expect(opened.location).toBe("extension");
      const merged = bridge.data.get("plan:202703") as TermPlan;
      expect(merged.sections.map((s) => s.crn)).toEqual(["1", "2"]);
      expect(bridge.data.get("settings")).toEqual(SETTINGS);
      expect(await browserStore.keys()).toEqual([]);
    } finally {
      bridge.uninstall();
    }
  });
});
