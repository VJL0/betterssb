import { searchProfessors } from "@workspace/api-client";
import {
  buildResultRecord,
  failedResultRecord,
  type AutoRegBatchResultRecord,
} from "@workspace/shared/lib/auto-reg-batch-result";
import { armProblem } from "@workspace/shared/lib/auto-reg-queue";
import { matchingProfile } from "@workspace/shared/lib/instructors";
import type {
  AutoRegQueue,
  AutoRegSnapshot,
} from "@workspace/shared/types/auto-reg";
import type { BannerConnection } from "@workspace/shared/types/store";
import { setUpApiClient } from "@/lib/api-client";
import {
  BANNER_CONNECTION_KEY,
  isSignedInToBanner,
} from "@/lib/banner-session";
import {
  AUTO_REG_RUN_STATE_KEY,
  getAutoRegRunState,
  patchAutoRegRunState,
  type AutoRegRunState,
} from "@/lib/auto-reg-run-state";
import {
  AUTO_REG_QUEUE_KEY,
  getAutoRegQueue,
  saveAutoRegQueue,
} from "@/lib/auto-reg-queue-storage";
import {
  DATA_CONSENT_KEY,
  DATA_CONSENT_REQUIRED,
  hasDataConsent,
} from "@/lib/data-consent";
import {
  onMessage,
  sendTabMessage,
  type ExtensionMessage,
  type ExtensionResponse,
} from "@/lib/messaging";
import * as ssb from "@/lib/ssb-api";
import { BANNER_PAGES, DARS_PAGES, DARS_START_URL } from "@/lib/temple-urls";
import { lookUpRegistrationTime } from "@/lib/tuportal-api";

const DARS_TAB_READY_TIMEOUT_MS = 150_000;
const DARS_SIGN_IN_POLL_MS = 1000;
// The DARS content script may still be loading right after sign-in.
const DARS_RELAY_ATTEMPTS = 10;
const DARS_RELAY_RETRY_MS = 500;

/** Fires every minute: the run reminder, and watching Banner while armed. */
const AUTO_REG_REMINDER_ALARM = "betterssb:autoRegReminder";
const AUTO_REG_REMINDER_LEAD_MINUTES = 5;
const AUTO_REG_RUN_ALARM = "betterssb:autoRegRun";
const AUTO_REG_REMINDER_NOTIFICATION = "betterssb:autoRegReminder";
const AUTO_REG_DONE_NOTIFICATION = "betterssb:autoRegDone";
const AUTO_REG_FAILED_NOTIFICATION = "betterssb:autoRegFailed";
const BANNER_SIGNED_OUT_NOTIFICATION = "betterssb:bannerSignedOut";

const NOTIFICATION_ICON = "icon/128.png";
/** On the toolbar icon until the student agrees to the popup's data disclosure. */
const CONSENT_NEEDED_BADGE = "!";
const NOTIFICATION_MESSAGE_MAX_LENGTH = 220;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function unknownMessage(msg: ExtensionMessage): ExtensionResponse {
  return { success: false, error: `Unknown message type: ${msg.type}` };
}

function notify(id: string, title: string, message: string): void {
  void browser.notifications.create(id, {
    type: "basic",
    iconUrl: NOTIFICATION_ICON,
    title,
    message: message.slice(0, NOTIFICATION_MESSAGE_MAX_LENGTH),
    priority: 2,
  });
}

async function answerFromBanner(
  call: () => Promise<unknown>,
): Promise<ExtensionResponse> {
  try {
    return { success: true, data: await call() };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Banner request failed",
    };
  }
}

async function handleBannerMessage(
  msg: ExtensionMessage,
): Promise<ExtensionResponse> {
  switch (msg.type) {
    case "SSB_REG_GET_TERMS":
      return answerFromBanner(() => ssb.getRegistrationTerms());
    case "SSB_REG_GET_PLANS": {
      const { term } = msg.payload;
      return answerFromBanner(async () => {
        await ssb.openRegistration(term);
        return ssb.getPlans();
      });
    }
    default:
      return unknownMessage(msg);
  }
}

/** An armed run submits through Banner, so a sign-out is worth interrupting for. */
async function warnArmedSignOut(): Promise<void> {
  if (!(await getAutoRegRunState()).armed) return;
  notify(
    BANNER_SIGNED_OUT_NOTIFICATION,
    "Banner signed you out",
    "Auto-register is on but can't register you until you sign back in to Banner.",
  );
}

/**
 * Banner, checked now with the student's cookies; no Banner tab is needed.
 * A change is saved, which tells the popup and the website, and a sign-out
 * warns an armed run. "not-connected" means Banner couldn't be reached.
 */
async function checkBanner(): Promise<BannerConnection> {
  const connection = await isSignedInToBanner().then(
    (signedIn): BannerConnection => (signedIn ? "connected" : "signed-out"),
    (): BannerConnection => "not-connected",
  );
  const stored = await browser.storage.local.get(BANNER_CONNECTION_KEY);
  const before: unknown = stored[BANNER_CONNECTION_KEY];
  if (before === connection) return connection;
  await browser.storage.local.set({ [BANNER_CONNECTION_KEY]: connection });
  if (before === "connected" && connection === "signed-out") {
    await warnArmedSignOut();
  }
  return connection;
}

async function bannerTabIds(): Promise<number[]> {
  const tabs = await browser.tabs.query({ url: BANNER_PAGES });
  return tabs.flatMap((tab) => (tab.id == null ? [] : [tab.id]));
}

/**
 * Open Banner pages sign the student out after their own idle timeout, which
 * ends the session the run needs, so each one restarts its timer.
 */
async function restartBannerPageTimers(): Promise<void> {
  await Promise.all(
    (await bannerTabIds()).map((tabId) =>
      sendTabMessage(tabId, { type: "BANNER_RESTART_TIMER", payload: {} })
        // A tab still loading starts its timer fresh anyway.
        .catch(() => undefined),
    ),
  );
}

/**
 * While a run is armed: checks Banner every minute, so a sign-out is noticed
 * at once. The check is also what keeps the session: each request restarts
 * Banner's idle window, so the session outlives it with no other calls
 * (docs/ssb-login-system.md, "How the extension uses this").
 */
async function watchBannerWhileArmed(): Promise<void> {
  if (!(await getAutoRegRunState()).armed) return;
  if ((await checkBanner()) !== "connected") return;
  await restartBannerPageTimers();
}

/** A DARS tab is usable once it's on a `/selfservice/` page (i.e. past SSO login). */
function isDarsReady(tab: Browser.tabs.Tab): boolean {
  return !!tab.url?.includes("/selfservice/");
}

/**
 * Finds a logged-in DARS tab, or opens one and waits for the student to finish
 * signing in (SSO + Duo) before resolving with its id.
 */
async function getOrOpenDarsTab(): Promise<number> {
  const tabs = await browser.tabs.query({ url: DARS_PAGES });
  const ready = tabs.find(isDarsReady);
  if (ready?.id != null) return ready.id;

  const tab =
    tabs[0] ??
    (await browser.tabs.create({ url: DARS_START_URL, active: true }));
  const tabId = tab.id;
  if (tabId == null) throw new Error("Could not open a DARS tab.");

  const deadline = Date.now() + DARS_TAB_READY_TIMEOUT_MS;
  for (;;) {
    const current = await browser.tabs.get(tabId).catch(() => null);
    if (!current)
      throw new Error("The DARS tab was closed before sign-in finished.");
    if (isDarsReady(current)) return tabId;
    if (Date.now() >= deadline) {
      throw new Error(
        "Timed out waiting for DARS sign-in. Sign in, then try again.",
      );
    }
    await sleep(DARS_SIGN_IN_POLL_MS);
  }
}

/** Relays a message to the DARS content script, retrying while it finishes loading. */
async function relayToDarsTab(
  msg: ExtensionMessage,
): Promise<ExtensionResponse> {
  const tabId = await getOrOpenDarsTab();
  let lastError = "DARS tab did not respond.";
  for (let attempt = 0; attempt < DARS_RELAY_ATTEMPTS; attempt++) {
    try {
      return await sendTabMessage(tabId, msg);
    } catch (err) {
      lastError = err instanceof Error ? err.message : lastError;
      await sleep(DARS_RELAY_RETRY_MS);
    }
  }
  return { success: false, error: lastError };
}

function snapshotOf(
  queue: AutoRegQueue,
  run: AutoRegRunState,
): AutoRegSnapshot {
  return { ...queue, armed: run.armed, lastResult: run.lastResult };
}

/**
 * Auto-register requests from the website (through the web bridge) and the
 * popup. Arming is checked here, so no caller can arm an incomplete queue.
 */
async function handleAutoRegMessage(
  msg: ExtensionMessage,
): Promise<ExtensionResponse> {
  const queue = await getAutoRegQueue();
  const run = await getAutoRegRunState();
  switch (msg.type) {
    case "AUTOREG_GET":
      return { success: true, data: snapshotOf(queue, run) };
    case "AUTOREG_SAVE_QUEUE": {
      if (run.armed) {
        return {
          success: false,
          error: "Turn off auto-register to change your classes.",
        };
      }
      await saveAutoRegQueue(msg.payload.queue);
      return { success: true };
    }
    case "AUTOREG_ARM": {
      const problem = armProblem(queue, Date.now());
      if (problem) return { success: false, error: problem };
      await patchAutoRegRunState({ armed: true, dedupeRunKey: "" });
      await watchBannerWhileArmed();
      return { success: true };
    }
    case "AUTOREG_DISARM":
      await patchAutoRegRunState({ armed: false });
      return { success: true };
    case "AUTOREG_REGISTRATION_TIME": {
      const { term } = msg.payload;
      return { success: true, data: await lookUpRegistrationTime(term) };
    }
    default:
      return unknownMessage(msg);
  }
}

/** Sets the one-shot run alarm; the queue is submitted only from it (single attempt). */
async function syncAutoRegRunAlarm(): Promise<void> {
  await browser.alarms.clear(AUTO_REG_RUN_ALARM);
  const { armed } = await getAutoRegRunState();
  const { scheduledRunAt } = await getAutoRegQueue();
  if (!armed || !scheduledRunAt) return;

  const when = new Date(scheduledRunAt).getTime();
  if (!Number.isFinite(when) || when <= Date.now()) return;

  await browser.alarms.create(AUTO_REG_RUN_ALARM, { when });
}

function minutesUntil(iso: string): number {
  return (new Date(iso).getTime() - Date.now()) / 60_000;
}

function isDue(scheduledRunAt: string): boolean {
  const at = new Date(scheduledRunAt).getTime();
  return Number.isFinite(at) && at <= Date.now();
}

/** Stable idempotency key for one run of a queue (time + term + CRNs). */
function dedupeRunKeyOf(queue: AutoRegQueue): string {
  return `${queue.scheduledRunAt}|${queue.term}|${queue.crns.join(",")}`;
}

/** Notifies once when an armed run is a few minutes away. */
async function remindBeforeAutoRegRun(): Promise<void> {
  const { armed, reminderForScheduledRunAt } = await getAutoRegRunState();
  if (!armed) return;

  const { scheduledRunAt } = await getAutoRegQueue();
  if (!scheduledRunAt || reminderForScheduledRunAt === scheduledRunAt) return;

  const minutesLeft = minutesUntil(scheduledRunAt);
  if (!(minutesLeft > 0 && minutesLeft <= AUTO_REG_REMINDER_LEAD_MINUTES))
    return;

  await patchAutoRegRunState({ reminderForScheduledRunAt: scheduledRunAt });
  const shownMinutes = Math.ceil(minutesLeft);
  notify(
    AUTO_REG_REMINDER_NOTIFICATION,
    "Registration starts soon",
    `Your registration time starts in about ${shownMinutes} minute${shownMinutes === 1 ? "" : "s"}.`,
  );
}

async function finishAutoRegRun(
  record: AutoRegBatchResultRecord,
): Promise<void> {
  await patchAutoRegRunState({ lastResult: record, armed: false });
  await browser.alarms.clear(AUTO_REG_RUN_ALARM);
}

/** Submits the armed queue to Banner, once, and records the outcome. */
async function submitAutoRegQueue(): Promise<void> {
  const run = await getAutoRegRunState();
  if (!run.armed) return;

  const queue = await getAutoRegQueue();
  if (!isDue(queue.scheduledRunAt) || !queue.term || queue.crns.length === 0) {
    return;
  }

  const dedupeRunKey = dedupeRunKeyOf(queue);
  if (run.dedupeRunKey === dedupeRunKey) return;
  await patchAutoRegRunState({ dedupeRunKey });

  const submitted = await ssb
    .executeRegistrationSubmit(queue.term, queue.crns)
    .catch((err: unknown) =>
      err instanceof Error ? err : new Error("Banner request failed"),
    );
  const at = new Date().toISOString();

  if (submitted instanceof Error) {
    await finishAutoRegRun(failedResultRecord(submitted.message, at));
    notify(
      AUTO_REG_FAILED_NOTIFICATION,
      "Auto-register failed",
      submitted.message,
    );
    return;
  }

  const record = buildResultRecord(
    submitted.batchResponse,
    queue.crns,
    submitted.stagingFailures,
    at,
  );
  await finishAutoRegRun(record);
  notify(
    AUTO_REG_DONE_NOTIFICATION,
    record.ok ? "Auto-register complete" : "Auto-register — errors",
    record.summary || "See the results on the Register page.",
  );
}

async function fetchRating(name: string): Promise<ExtensionResponse> {
  const { data: ratings } = await searchProfessors({ query: { name } });
  return { success: true, data: matchingProfile(name, ratings) };
}

/** Points the student to the popup's data disclosure until they agree to it. */
async function showConsentBadge(): Promise<void> {
  const text = (await hasDataConsent()) ? "" : CONSENT_NEEDED_BADGE;
  await browser.action.setBadgeText({ text });
}

async function handleMessage(
  msg: ExtensionMessage,
): Promise<ExtensionResponse> {
  if (!(await hasDataConsent())) {
    return { success: false, error: DATA_CONSENT_REQUIRED };
  }
  if (msg.type.startsWith("SSB_")) return handleBannerMessage(msg);
  if (msg.type.startsWith("AUTOREG_")) return handleAutoRegMessage(msg);
  switch (msg.type) {
    case "BANNER_STATUS":
      return { success: true, data: await checkBanner() };
    case "DARS_RUN_AUDIT":
      return relayToDarsTab(msg);
    case "FETCH_RATING":
      return fetchRating(msg.payload.name);
    default:
      return unknownMessage(msg);
  }
}

export default defineBackground(() => {
  setUpApiClient();

  onMessage(async (msg, sendResponse) => {
    try {
      sendResponse(await handleMessage(msg));
    } catch (err) {
      sendResponse({
        success: false,
        error: err instanceof Error ? err.message : "Background script error",
      });
    }
  });

  void syncAutoRegRunAlarm();
  void showConsentBadge();

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (AUTO_REG_RUN_STATE_KEY in changes || AUTO_REG_QUEUE_KEY in changes) {
      void syncAutoRegRunAlarm();
    }
    if (DATA_CONSENT_KEY in changes) void showConsentBadge();
  });

  browser.alarms.create(AUTO_REG_REMINDER_ALARM, { periodInMinutes: 1 });

  browser.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === AUTO_REG_REMINDER_ALARM) {
      await remindBeforeAutoRegRun();
      await watchBannerWhileArmed();
    } else if (alarm.name === AUTO_REG_RUN_ALARM) await submitAutoRegQueue();
  });
});
