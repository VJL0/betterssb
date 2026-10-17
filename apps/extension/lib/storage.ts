import type { RmpRating, SchedulePreferences } from "@workspace/api-client";

const KEYS = {
  SCHEDULE_PREFS: "betterssb:schedulePreferences",
  CACHED_RATINGS: "betterssb:cachedRatings",
} as const;

export async function getStorageItem<T>(key: string): Promise<T | null> {
  const result = await browser.storage.local.get(key);
  return (result[key] as T) ?? null;
}

export async function setStorageItem<T>(key: string, value: T): Promise<void> {
  await browser.storage.local.set({ [key]: value });
}

export async function removeStorageItem(key: string): Promise<void> {
  await browser.storage.local.remove(key);
}

export async function getSchedulePreferences(): Promise<SchedulePreferences> {
  return (await getStorageItem<SchedulePreferences>(KEYS.SCHEDULE_PREFS)) ?? {};
}

export async function saveSchedulePreferences(
  prefs: SchedulePreferences,
): Promise<void> {
  await setStorageItem(KEYS.SCHEDULE_PREFS, prefs);
}

export async function getCachedRatings(): Promise<Record<string, RmpRating>> {
  return (
    (await getStorageItem<Record<string, RmpRating>>(KEYS.CACHED_RATINGS)) ?? {}
  );
}

export async function cacheRating(
  professorName: string,
  rating: RmpRating,
): Promise<void> {
  const cached = await getCachedRatings();
  cached[professorName.toLowerCase()] = rating;
  await setStorageItem(KEYS.CACHED_RATINGS, cached);
}
