import { searchProfessors } from "@workspace/api-client";
import {
  buildResultRecord,
  failedResultRecord,
  isExecuteRegistrationResult,
  type AutoRegBatchResultRecord,
} from "@workspace/shared/lib/auto-reg-batch-result";
import {
  armProblem,
  crnLookupResult,
} from "@workspace/shared/lib/auto-reg-queue";
import { matchingProfile } from "@workspace/shared/lib/instructors";
import type {
  AutoRegQueue,
  AutoRegSnapshot,
  CrnCheck,
} from "@workspace/shared/types/auto-reg";
import type { BannerConnection } from "@workspace/shared/types/store";
import { setUpApiClient } from "@/lib/api-client";
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
  onMessage,
  sendTabMessage,
  type ExtensionMessage,
  type ExtensionResponse,
} from "@/lib/messaging";
import { BANNER_PAGES, DARS_PAGES, DARS_START_URL } from "@/lib/temple-urls";
import { lookUpRegistrationTime } from "@/lib/tuportal-api";

const DARS_TAB_READY_TIMEOUT_MS = 150_000;
const DARS_SIGN_IN_POLL_MS = 1000;
// The DARS content script may still be loading right after sign-in.
const DARS_RELAY_ATTEMPTS = 10;
const DARS_RELAY_RETRY_MS = 500;

/** Set when a Banner call fails the way an expired session does; cleared on the next success. */
const BANNER_SIGNED_OUT_KEY = "betterssb:bannerSignedOut";
// A signed-out Banner answers XHRs with 401/403 or its HTML login page instead of JSON.
const BANNER_SIGNED_OUT_ERROR =
  /\b(401|403)\b|not valid JSON|Unexpected token '<'/i;

const AUTO_REG_REMINDER_ALARM = "betterssb:autoRegReminder";
const AUTO_REG_REMINDER_LEAD_MINUTES = 5;
const AUTO_REG_RUN_ALARM = "betterssb:autoRegRun";
const AUTO_REG_REMINDER_NOTIFICATION = "betterssb:autoRegReminder";
const AUTO_REG_DONE_NOTIFICATION = "betterssb:autoRegDone";
const AUTO_REG_FAILED_NOTIFICATION = "betterssb:autoRegFailed";

const NOTIFICATION_ICON = "icon/128.png";
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

// ── Banner tab ──────────────────────────────────────────────────────────────

async function findBannerTab(): Promise<number | null> {
  const tabs = await browser.tabs.query({ url: BANNER_PAGES });
  return tabs[0]?.id ?? null;
}

async function recordBannerSession(result: ExtensionResponse): Promise<void> {
  const signedOut =
    !result.success && BANNER_SIGNED_OUT_ERROR.test(result.error ?? "");
  // Other failures say nothing about the session, so they leave it as it was.
  if (!signedOut && !result.success) return;
  const stored = await browser.storage.local.get(BANNER_SIGNED_OUT_KEY);
  if (stored[BANNER_SIGNED_OUT_KEY] !== signedOut) {
    await browser.storage.local.set({ [BANNER_SIGNED_OUT_KEY]: signedOut });
  }
}

async function relayToBannerTab(
  msg: ExtensionMessage,
): Promise<ExtensionResponse> {
  const tabId = await findBannerTab();
  if (!tabId) {
    return {
      success: false,
      error: "No SSB tab found. Please open your registration page first.",
    };
  }
  const result = await sendTabMessage(tabId, msg);
  await recordBannerSession(result);
  return result;
}

/**
 * Whether Banner is usable: an open Banner tab whose last relayed call didn't
 * fail like an expired session. "not-connected" also covers never opening Banner.
 */
async function bannerConnection(): Promise<BannerConnection> {
  if (!(await findBannerTab())) return "not-connected";
  const stored = await browser.storage.local.get(BANNER_SIGNED_OUT_KEY);
  return stored[BANNER_SIGNED_OUT_KEY] === true ? "signed-out" : "connected";
}

// ── DARS tab ────────────────────────────────────────────────────────────────

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

// ── Auto-register queue ─────────────────────────────────────────────────────

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
          error: "Disarm auto-register to change the queue.",
        };
      }
      await saveAutoRegQueue(msg.payload.queue);
      return { success: true };
    }
    case "AUTOREG_ARM": {
      const problem = armProblem(queue, Date.now());
      if (problem) return { success: false, error: problem };
      await patchAutoRegRunState({ armed: true, dedupeRunKey: "" });
      return { success: true };
    }
    case "AUTOREG_DISARM":
      await patchAutoRegRunState({ armed: false });
      return { success: true };
    case "AUTOREG_CHECK_CRNS": {
      const { term, crns } = msg.payload;
      const checks: CrnCheck[] = [];
      // One at a time: Banner keeps registration state per session.
      for (const crn of crns) {
        const result = await relayToBannerTab({
          type: "SSB_REG_GET_SECTION_CRN",
          payload: { crn, term },
        });
        checks.push({ crn, found: crnLookupResult(crn, result) });
      }
      return { success: true, data: checks };
    }
    case "AUTOREG_REGISTRATION_TIME": {
      const { term } = msg.payload;
      return { success: true, data: await lookUpRegistrationTime(term) };
    }
    default:
      return unknownMessage(msg);
  }
}

// ── Auto-register run ───────────────────────────────────────────────────────

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
    "Registration Opening Soon!",
    `Your registration window opens in ~${shownMinutes} minute${shownMinutes === 1 ? "" : "s"}.`,
  );
}

async function finishAutoRegRun(
  record: AutoRegBatchResultRecord,
): Promise<void> {
  await patchAutoRegRunState({ lastResult: record, armed: false });
  await browser.alarms.clear(AUTO_REG_RUN_ALARM);
}

/** Submits the armed queue in the Banner tab, once, and records the outcome. */
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

  const result = await relayToBannerTab({
    type: "SSB_AUTO_REGISTER_RUN",
    payload: { term: queue.term, crnList: queue.crns },
  });
  const at = new Date().toISOString();

  if (!result.success) {
    const error = result.error ?? "Unknown error";
    await finishAutoRegRun(failedResultRecord(error, at));
    notify(AUTO_REG_FAILED_NOTIFICATION, "Auto-register failed", error);
    return;
  }

  const submitted = isExecuteRegistrationResult(result.data)
    ? result.data
    : null;
  const record = buildResultRecord(
    submitted?.batchResponse ?? null,
    queue.crns,
    submitted?.stagingFailures ?? [],
    at,
  );
  await finishAutoRegRun(record);
  notify(
    AUTO_REG_DONE_NOTIFICATION,
    record.ok ? "Auto-register complete" : "Auto-register — errors",
    record.summary || "Batch submitted. See results in Auto-Register.",
  );
}

// ── Messages ────────────────────────────────────────────────────────────────

async function fetchRating(name: string): Promise<ExtensionResponse> {
  const { data: ratings } = await searchProfessors({ query: { name } });
  return { success: true, data: matchingProfile(name, ratings) };
}

async function handleMessage(
  msg: ExtensionMessage,
): Promise<ExtensionResponse> {
  if (msg.type.startsWith("SSB_")) return relayToBannerTab(msg);
  if (msg.type.startsWith("AUTOREG_")) return handleAutoRegMessage(msg);
  switch (msg.type) {
    case "BANNER_STATUS":
      return { success: true, data: await bannerConnection() };
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

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (AUTO_REG_RUN_STATE_KEY in changes || AUTO_REG_QUEUE_KEY in changes) {
      void syncAutoRegRunAlarm();
    }
  });

  browser.alarms.create(AUTO_REG_REMINDER_ALARM, { periodInMinutes: 1 });

  browser.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === AUTO_REG_REMINDER_ALARM) await remindBeforeAutoRegRun();
    else if (alarm.name === AUTO_REG_RUN_ALARM) await submitAutoRegQueue();
  });
});
