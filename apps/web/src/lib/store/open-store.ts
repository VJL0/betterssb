import { mergeStoreInto } from "@workspace/shared/lib/store";
import type { LocalStore } from "@workspace/shared/types/store";
import { waitForExtension } from "../extension";
import { extensionStore } from "./extension-store";
import { IndexedDbStore } from "./indexeddb-store";

export type StoreLocation = "extension" | "browser";

export interface OpenedStore {
  store: LocalStore;
  /** Where documents live: the extension's storage, or this browser's IndexedDB. */
  location: StoreLocation;
}

/**
 * Opens the local-first store. With the extension installed its store is the
 * one copy, so anything saved here before it was installed is merged into it
 * once and then removed from IndexedDB, leaving no second copy to drift.
 */
export async function openStore(
  browserStore = new IndexedDbStore(),
): Promise<OpenedStore> {
  if (!(await waitForExtension())) {
    return { store: browserStore, location: "browser" };
  }
  if ((await browserStore.keys()).length > 0) {
    await mergeStoreInto(browserStore, extensionStore);
    await browserStore.clear();
  }
  return { store: extensionStore, location: "extension" };
}
