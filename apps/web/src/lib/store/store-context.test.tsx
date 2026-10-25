import { act, renderHook, waitFor } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UserSettings } from "@workspace/shared/types/store";
import { IndexedDbStore } from "./indexeddb-store";
import type { OpenedStore } from "./open-store";
import { StoreProvider, useStoreDocument } from "./store-context";

const SETTINGS: UserSettings = {
  term: "202703",
  major: "",
  startTerm: null,
  program: null,
  keyboardShortcuts: true,
  bannerOverlay: true,
  updatedAt: "2026-10-17T00:00:00.000Z",
};

beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function wrapperFor(open: () => Promise<OpenedStore>) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <StoreProvider open={open}>{children}</StoreProvider>;
  };
}

describe("useStoreDocument", () => {
  it("loads, saves, and follows changes made elsewhere", async () => {
    const store = new IndexedDbStore();
    const opened: OpenedStore = { store, location: "browser" };
    const { result } = renderHook(() => useStoreDocument("settings"), {
      wrapper: wrapperFor(async () => opened),
    });

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.value).toBeNull();

    await act(() => result.current.save(SETTINGS));
    expect(await store.get("settings")).toEqual(SETTINGS);

    const changed = { ...SETTINGS, term: "202736" };
    await act(() => store.set("settings", changed));
    await waitFor(() => expect(result.current.value?.term).toBe("202736"));
  });

  it("reports when the store can't open", async () => {
    const { result } = renderHook(() => useStoreDocument("audit"), {
      wrapper: wrapperFor(() => Promise.reject(new Error("blocked"))),
    });
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error?.message).toBe("blocked");
  });
});
