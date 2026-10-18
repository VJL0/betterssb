import type {
  LocalStore,
  StoreDocuments,
  StoreKey,
} from "@workspace/shared/types/store";
import { bridgeRequest, onExtensionStoreChange } from "../extension";

/**
 * The extension's store (chrome.storage.local), reached through the bridge.
 * The popup and Banner overlay read the same documents.
 */
export const extensionStore: LocalStore = {
  get<K extends StoreKey>(key: K) {
    return bridgeRequest<StoreDocuments[K] | null>({ type: "STORE_GET", key });
  },
  set(key, value) {
    return bridgeRequest<void>({ type: "STORE_SET", key, value });
  },
  delete(key) {
    return bridgeRequest<void>({ type: "STORE_DELETE", key });
  },
  keys() {
    return bridgeRequest<StoreKey[]>({ type: "STORE_KEYS" });
  },
  subscribe(listener) {
    return onExtensionStoreChange(listener);
  },
};
