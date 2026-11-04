/** A chrome.storage.local value, unknown until the caller checks its shape. */
export async function getStorageItem(key: string): Promise<unknown> {
  const result = await browser.storage.local.get(key);
  return result[key] ?? null;
}

export async function setStorageItem<T>(key: string, value: T): Promise<void> {
  await browser.storage.local.set({ [key]: value });
}
