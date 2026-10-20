import { setUpApiClient } from "@/lib/api-client";
import { onMessage, sendTabMessage } from "@/lib/messaging";
import { matchingProfile } from "@workspace/shared/lib/instructors";
import type { ExtensionMessage, ExtensionResponse } from "@/lib/messaging";
import {
  buildResultRecord,
  type AutoRegBatchResultRecord,
  type StagingFailure,
} from "@workspace/shared/lib/auto-reg-batch-result";
import {
  parseAutoRegBatchResultJson,
  parseManualCrns,
} from "@workspace/shared/lib/auto-reg-helpers";
import {
  armProblem,
  crnLookupResult,
} from "@workspace/shared/lib/auto-reg-queue";
import type {
  AutoRegQueue,
  AutoRegSnapshot,
  CrnCheck,
} from "@workspace/shared/types/auto-reg";
import {
  AUTO_REG_SCHEDULE_CONFIG_KEY,
  getAutoRegScheduleConfig,
  patchAutoRegScheduleConfig,
  type AutoRegScheduleConfig,
} from "@/lib/auto-reg-schedule-config";
import {
  AUTO_REG_RUN_STATE_KEY,
  getAutoRegRunState,
  patchAutoRegRunState,
  type AutoRegRunState,
} from "@/lib/auto-reg-run-state";
import type { BannerConnection } from "@workspace/shared/types/store";
import { searchProfessors } from "@workspace/api-client";

const SSB_URL_PATTERN = "*://*.temple.edu/StudentRegistrationSsb/*";
const DARS_URL_PATTERN = "*://prd-dars.temple.edu/selfservice/*";
const DARS_START_URL =
  "https://prd-dars.temple.edu/selfservice/audit/create.html";
const DARS_TAB_READY_TIMEOUT_MS = 150_000;

const REG_CHECK_ALARM = "betterssb-reg-check";
/** Set when a Banner call fails the way an expired session does; cleared on the next success. */
const BANNER_SIGNED_OUT_KEY = "betterssb:bannerSignedOut";
// A signed-out Banner answers XHRs with 401/403 or its HTML login page instead of JSON.
const SIGNED_OUT_ERROR = /\b(401|403)\b|not valid JSON|Unexpected token '<'/i;
const AUTO_REG_FIRE_ALARM = "betterssb-auto-reg-fire";

/** Fires once at `when` — batch runs only from this alarm (single attempt). */
async function syncAutoRegFireAlarm(): Promise<void> {
  await browser.alarms.clear(AUTO_REG_FIRE_ALARM);
  const { armed } = await getAutoRegRunState();
  const { scheduledRunAt } = await getAutoRegScheduleConfig();
  if (!armed || !scheduledRunAt?.trim()) return;

  const when = new Date(scheduledRunAt).getTime();
  if (!Number.isFinite(when) || when <= Date.now()) return;

  await browser.alarms.create(AUTO_REG_FIRE_ALARM, { when });
}

async function findSSBTab(): Promise<number | null> {
  const tabs = await browser.tabs.query({ url: SSB_URL_PATTERN });
  return tabs[0]?.id ?? null;
}

async function recordBannerSession(result: ExtensionResponse): Promise<void> {
  const signedOut =
    !result.success && SIGNED_OUT_ERROR.test(result.error ?? "");
  if (signedOut || result.success) {
    const stored = await browser.storage.local.get(BANNER_SIGNED_OUT_KEY);
    if (stored[BANNER_SIGNED_OUT_KEY] !== signedOut) {
      await browser.storage.local.set({ [BANNER_SIGNED_OUT_KEY]: signedOut });
    }
  }
}

async function relayToSSBTab(
  msg: ExtensionMessage,
): Promise<ExtensionResponse> {
  const tabId = await findSSBTab();
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
  if (!(await findSSBTab())) return "not-connected";
  const stored = await browser.storage.local.get(BANNER_SIGNED_OUT_KEY);
  return stored[BANNER_SIGNED_OUT_KEY] === true ? "signed-out" : "connected";
}

function isSSBMessage(type: string): boolean {
  return type.startsWith("SSB_");
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
  const tabs = await browser.tabs.query({ url: DARS_URL_PATTERN });
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
    await new Promise((r) => setTimeout(r, 1000));
  }
}

/** Relays a message to the DARS content script, retrying while it finishes loading. */
async function relayToDarsTab(
  msg: ExtensionMessage,
): Promise<ExtensionResponse> {
  const tabId = await getOrOpenDarsTab();
  let lastError = "DARS tab did not respond.";
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      return await sendTabMessage(tabId, msg);
    } catch (err) {
      lastError = err instanceof Error ? err.message : lastError;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  return { success: false, error: lastError };
}

function queueOf(config: AutoRegScheduleConfig): AutoRegQueue {
  return {
    term: config.term.trim(),
    crns: parseManualCrns(config.crns),
    scheduledRunAt: config.scheduledRunAt,
  };
}

function snapshotOf(
  config: AutoRegScheduleConfig,
  run: AutoRegRunState,
): AutoRegSnapshot {
  return {
    ...queueOf(config),
    armed: run.armed,
    lastResult: parseAutoRegBatchResultJson(run.lastBatchResultJson),
  };
}

/**
 * Auto-register requests from the website (through the web bridge) and the
 * popup. Arming is checked here, so no caller can arm an incomplete queue.
 */
async function handleAutoRegister(
  msg: ExtensionMessage,
): Promise<ExtensionResponse> {
  const config = await getAutoRegScheduleConfig();
  const run = await getAutoRegRunState();
  switch (msg.type) {
    case "AUTOREG_GET":
      return { success: true, data: snapshotOf(config, run) };
    case "AUTOREG_SAVE_QUEUE": {
      if (run.armed) {
        return {
          success: false,
          error: "Disarm auto-register to change the queue.",
        };
      }
      const { queue } = msg.payload as { queue: AutoRegQueue };
      await patchAutoRegScheduleConfig({
        term: queue.term,
        crns: queue.crns.join(", "),
        scheduledRunAt: queue.scheduledRunAt,
        // CRNs come from the website now, not from a Banner plan.
        manualMode: true,
      });
      return { success: true };
    }
    case "AUTOREG_ARM": {
      const problem = armProblem(queueOf(config), Date.now());
      if (problem) return { success: false, error: problem };
      await patchAutoRegRunState({ armed: true, dedupeRunKey: "" });
      return { success: true };
    }
    case "AUTOREG_DISARM":
      await patchAutoRegRunState({ armed: false });
      return { success: true };
    case "AUTOREG_CHECK_CRNS": {
      const { term, crns } = msg.payload as { term: string; crns: string[] };
      const checks: CrnCheck[] = [];
      // One at a time: Banner keeps registration state per session.
      for (const crn of crns) {
        const result = await relayToSSBTab({
          type: "SSB_REG_GET_SECTION_CRN",
          payload: { crn, term },
        });
        checks.push({ crn, found: crnLookupResult(crn, result) });
      }
      return { success: true, data: checks };
    }
    default:
      return { success: false, error: `Unknown message type: ${msg.type}` };
  }
}

function isAutoRegisterMessage(type: string): boolean {
  return type.startsWith("AUTOREG_");
}

/** Stable idempotency key for a specific batch attempt (time + term + CRNs). */
function buildBatchDedupeKey(
  scheduledRunAt: string,
  termCode: string,
  crnList: string[],
): string {
  return `${scheduledRunAt}|${termCode}|${crnList.join(",")}`;
}

export default defineBackground(() => {
  setUpApiClient();

  onMessage(async (msg, sendResponse) => {
    try {
      if (isSSBMessage(msg.type)) {
        const result = await relayToSSBTab(msg);
        sendResponse(result);
        return;
      }

      if (msg.type === "BANNER_STATUS") {
        sendResponse({ success: true, data: await bannerConnection() });
        return;
      }

      if (isAutoRegisterMessage(msg.type)) {
        sendResponse(await handleAutoRegister(msg));
        return;
      }

      if (msg.type === "DARS_RUN_AUDIT") {
        const result = await relayToDarsTab(msg);
        sendResponse(result);
        return;
      }

      switch (msg.type) {
        case "FETCH_RATING": {
          const { name } = msg.payload as { name: string };
          const { data: ratings } = await searchProfessors({
            query: { name },
          });
          sendResponse({
            success: true,
            data: matchingProfile(name, ratings),
          });
          break;
        }

        default:
          sendResponse({
            success: false,
            error: `Unknown message type: ${msg.type}`,
          });
      }
    } catch (err) {
      sendResponse({
        success: false,
        error: err instanceof Error ? err.message : "Background script error",
      });
    }
  });

  void syncAutoRegFireAlarm();

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (
      AUTO_REG_RUN_STATE_KEY in changes ||
      AUTO_REG_SCHEDULE_CONFIG_KEY in changes
    ) {
      void syncAutoRegFireAlarm();
    }
  });

  browser.alarms.create(REG_CHECK_ALARM, { periodInMinutes: 1 });

  browser.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === REG_CHECK_ALARM) {
      const { armed, reminderForScheduledRunAt } = await getAutoRegRunState();
      if (!armed) return;

      const { scheduledRunAt: targetTime } = await getAutoRegScheduleConfig();
      if (!targetTime) return;

      const target = new Date(targetTime).getTime();
      const now = Date.now();
      const diffMinutes = (target - now) / 60_000;

      if (diffMinutes > 0 && diffMinutes <= 5) {
        if (reminderForScheduledRunAt === targetTime) return;
        await patchAutoRegRunState({ reminderForScheduledRunAt: targetTime });
        browser.notifications.create("betterssb-reg-reminder", {
          type: "basic",
          iconUrl: "icon/128.png",
          title: "Registration Opening Soon!",
          message: `Your registration window opens in ~${Math.ceil(diffMinutes)} minute${Math.ceil(diffMinutes) === 1 ? "" : "s"}.`,
          priority: 2,
        });
      }
      return;
    }

    if (alarm.name !== AUTO_REG_FIRE_ALARM) return;

    const runState = await getAutoRegRunState();
    if (!runState.armed) return;

    const schedule = await getAutoRegScheduleConfig();
    const { scheduledRunAt: targetTime, term, crns: crnsRaw } = schedule;
    if (!targetTime) return;

    const targetMs = new Date(targetTime).getTime();
    if (!Number.isFinite(targetMs)) return;

    const now = Date.now();
    if (now < targetMs) return;

    if (!term?.trim() || !crnsRaw?.trim()) return;

    const crnList = parseManualCrns(crnsRaw);
    if (crnList.length === 0) return;

    const batchDedupeKey = buildBatchDedupeKey(
      targetTime,
      term.trim(),
      crnList,
    );
    if (runState.dedupeRunKey === batchDedupeKey) return;

    await patchAutoRegRunState({ dedupeRunKey: batchDedupeKey });

    const result = await relayToSSBTab({
      type: "SSB_AUTO_REGISTER_RUN",
      payload: { term: term.trim(), crnList },
    });

    const at = new Date().toISOString();

    if (result.success) {
      const raw = result.data as {
        stagingFailures: StagingFailure[];
        batchResponse: unknown;
      } | null;
      const record = buildResultRecord(
        raw?.batchResponse ?? null,
        raw?.stagingFailures ?? [],
        at,
      );
      await patchAutoRegRunState({
        lastBatchResultJson: JSON.stringify(record),
        armed: false,
      });
      await browser.alarms.clear(AUTO_REG_FIRE_ALARM);
      browser.notifications.create("betterssb-reg-done", {
        type: "basic",
        iconUrl: "icon/128.png",
        title: record.ok ? "Auto-register complete" : "Auto-register — errors",
        message:
          record.summary.slice(0, 220) ||
          "Batch submitted. See results in Auto-Register.",
        priority: 2,
      });
    } else {
      const err = result.error ?? "Unknown error";
      const record: AutoRegBatchResultRecord = {
        at,
        ok: false,
        registeredCount: 0,
        failedCount: 0,
        stagingFailures: [],
        crnResults: [],
        registeredHours: null,
        billingHours: null,
        summary: err,
        error: err,
      };
      await patchAutoRegRunState({
        lastBatchResultJson: JSON.stringify(record),
        armed: false,
      });
      await browser.alarms.clear(AUTO_REG_FIRE_ALARM);
      browser.notifications.create("betterssb-reg-fail", {
        type: "basic",
        iconUrl: "icon/128.png",
        title: "Auto-register failed",
        message: err.slice(0, 220),
        priority: 2,
      });
    }
  });
});
