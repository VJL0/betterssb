import { WEB_ORIGIN } from "@/lib/config";

/** Opens a BetterSSB website page in a new tab, e.g. "/register". */
export async function openWeb(path: string): Promise<void> {
  await browser.tabs.create({ url: `${WEB_ORIGIN}${path}` });
}

/** Opens any URL in a new tab, such as Banner registration. */
export async function openUrl(url: string): Promise<void> {
  await browser.tabs.create({ url });
}
