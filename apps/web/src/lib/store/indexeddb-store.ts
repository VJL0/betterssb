import { isStoreKey } from "@workspace/shared/lib/store";
import type {
  LocalStore,
  StoreDocuments,
  StoreKey,
} from "@workspace/shared/types/store";

const DB_NAME = "betterssb";
const DB_VERSION = 1;
const DOCUMENTS = "documents";
/** Tells other tabs a document changed. */
const CHANGES_CHANNEL = "betterssb-store";

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function openDatabase(): Promise<IDBDatabase> {
  const request = indexedDB.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = () => {
    request.result.createObjectStore(DOCUMENTS);
  };
  return promisify(request);
}

/**
 * The store in this browser's IndexedDB, used when the extension isn't
 * installed. Changes reach other tabs through a BroadcastChannel.
 */
export class IndexedDbStore implements LocalStore {
  private db: Promise<IDBDatabase> | null = null;
  private readonly listeners = new Set<(key: StoreKey) => void>();
  private channel: BroadcastChannel | null = null;

  private database(): Promise<IDBDatabase> {
    this.db ??= openDatabase();
    return this.db;
  }

  private async run<T>(
    mode: IDBTransactionMode,
    action: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const db = await this.database();
    return promisify(
      action(db.transaction(DOCUMENTS, mode).objectStore(DOCUMENTS)),
    );
  }

  private notify(key: StoreKey): void {
    for (const listener of this.listeners) listener(key);
    this.channel?.postMessage(key);
  }

  async get<K extends StoreKey>(key: K): Promise<StoreDocuments[K] | null> {
    const value = await this.run("readonly", (s) => s.get(key));
    return (value as StoreDocuments[K] | undefined) ?? null;
  }

  async set<K extends StoreKey>(
    key: K,
    value: StoreDocuments[K],
  ): Promise<void> {
    await this.run("readwrite", (s) => s.put(value, key));
    this.notify(key);
  }

  async delete(key: StoreKey): Promise<void> {
    await this.run("readwrite", (s) => s.delete(key));
    this.notify(key);
  }

  async keys(): Promise<StoreKey[]> {
    const keys = await this.run("readonly", (s) => s.getAllKeys());
    return keys.filter(isStoreKey);
  }

  /** Removes every document, after they've been moved to the extension. */
  async clear(): Promise<void> {
    const keys = await this.keys();
    await this.run("readwrite", (s) => s.clear());
    for (const key of keys) this.notify(key);
  }

  subscribe(listener: (key: StoreKey) => void): () => void {
    this.listeners.add(listener);
    if (!this.channel && typeof BroadcastChannel !== "undefined") {
      this.channel = new BroadcastChannel(CHANGES_CHANNEL);
      this.channel.onmessage = (event: MessageEvent) => {
        if (!isStoreKey(event.data)) return;
        for (const l of this.listeners) l(event.data);
      };
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        this.channel?.close();
        this.channel = null;
      }
    };
  }
}
