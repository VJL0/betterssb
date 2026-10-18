import {
  EXTENSION_STORE_PREFIX,
  isStoreKey,
} from "@workspace/shared/lib/store";
import type {
  LocalStore,
  StoreDocuments,
  StoreKey,
} from "@workspace/shared/types/store";

function storageKey(key: StoreKey): string {
  return `${EXTENSION_STORE_PREFIX}${key}`;
}

function storeKeyOf(storageKeyName: string): StoreKey | null {
  if (!storageKeyName.startsWith(EXTENSION_STORE_PREFIX)) return null;
  const key = storageKeyName.slice(EXTENSION_STORE_PREFIX.length);
  return isStoreKey(key) ? key : null;
}

/**
 * The local-first store in chrome.storage.local. The popup, the Banner overlay
 * and (through the web bridge) the website all read and write this one copy.
 */
export const extensionStore: LocalStore = {
  async get<K extends StoreKey>(key: K) {
    const name = storageKey(key);
    const result = await browser.storage.local.get(name);
    return (result[name] as StoreDocuments[K] | undefined) ?? null;
  },

  async set(key, value) {
    await browser.storage.local.set({ [storageKey(key)]: value });
  },

  async delete(key) {
    await browser.storage.local.remove(storageKey(key));
  },

  async keys() {
    const all = await browser.storage.local.get(null);
    return Object.keys(all)
      .map(storeKeyOf)
      .filter((k): k is StoreKey => k !== null);
  },

  subscribe(listener) {
    const onChanged = (changes: Record<string, unknown>) => {
      for (const name of Object.keys(changes)) {
        const key = storeKeyOf(name);
        if (key) listener(key);
      }
    };
    browser.storage.local.onChanged.addListener(onChanged);
    return () => browser.storage.local.onChanged.removeListener(onChanged);
  },
};
