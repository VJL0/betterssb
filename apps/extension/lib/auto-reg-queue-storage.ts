import { parseAutoRegQueue } from "@workspace/shared/lib/bridge";
import type { AutoRegQueue } from "@workspace/shared/types/auto-reg";
import { getStorageItem, setStorageItem } from "@/lib/storage";

export const AUTO_REG_QUEUE_KEY = "betterssb:autoRegQueue";

/** The queue saved from the website, or an empty one before any is saved. */
export async function getAutoRegQueue(): Promise<AutoRegQueue> {
  // Queues reach storage only through the bridge, which parses them the same way.
  const saved = parseAutoRegQueue(await getStorageItem(AUTO_REG_QUEUE_KEY));
  return saved ?? { term: "", crns: [], scheduledRunAt: "" };
}

export async function saveAutoRegQueue(queue: AutoRegQueue): Promise<void> {
  await setStorageItem(AUTO_REG_QUEUE_KEY, queue);
}
