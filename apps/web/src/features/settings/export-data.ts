import { downloadFile } from "@/lib/download";
import type { LocalStore, StoreKey } from "@workspace/shared/types/store";

export interface StoreExport {
  app: "BetterSSB";
  exportedAt: string;
  documents: Partial<Record<StoreKey, unknown>>;
}

/** Every document in the store, ready to save as a file. */
export async function exportStore(store: LocalStore): Promise<StoreExport> {
  const documents: Partial<Record<StoreKey, unknown>> = {};
  for (const key of await store.keys()) {
    documents[key] = await store.get(key);
  }
  return { app: "BetterSSB", exportedAt: new Date().toISOString(), documents };
}

/** Saves the store as `betterssb-data-YYYY-MM-DD.json`. */
export async function downloadStoreExport(store: LocalStore): Promise<void> {
  const data = await exportStore(store);
  downloadFile(
    JSON.stringify(data, null, 2),
    `betterssb-data-${data.exportedAt.slice(0, 10)}.json`,
    "application/json",
  );
}
