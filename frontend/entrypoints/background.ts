import { api } from "@/lib/api";
import { onMessage, sendTabMessage } from "@/lib/messaging";
import type { ExtensionMessage, ExtensionResponse } from "@/lib/messaging";
import {
  buildResultRecord,
  type AutoRegBatchResultRecord,
  type StagingFailure,
} from "@/lib/auto-reg-batch-result";
import { parseManualCrns } from "@/lib/auto-reg-helpers";
import {
  AUTO_REG_SCHEDULE_CONFIG_KEY,
  getAutoRegScheduleConfig,
} from "@/lib/auto-reg-schedule-config";
import {
  AUTO_REG_RUN_STATE_KEY,
  getAutoRegRunState,
  patchAutoRegRunState,
} from "@/lib/auto-reg-run-state";
import { getStorageItem, setStorageItem } from "@/lib/storage";
import type {
  Section,
  SchedulePreferences,
  ChatMessage,
  TranscriptCourse,
} from "@/types";

const SSB_URL_PATTERN = "*://*.edu/StudentRegistrationSsb/*";

const REG_CHECK_ALARM = "betterssb-reg-check";
const AUTO_REG_FIRE_ALARM = "betterssb-auto-reg-fire";

/** Fires once at `when` — batch runs only from this alarm (single attempt). */
async function syncAutoRegFireAlarm(): Promise<void> {
  await chrome.alarms.clear(AUTO_REG_FIRE_ALARM);
  const { armed } = await getAutoRegRunState();
  const { scheduledRunAt } = await getAutoRegScheduleConfig();
  if (!armed || !scheduledRunAt?.trim()) return;

  const when = new Date(scheduledRunAt).getTime();
  if (!Number.isFinite(when) || when <= Date.now()) return;

  await chrome.alarms.create(AUTO_REG_FIRE_ALARM, { when });
}

async function findSSBTab(): Promise<number | null> {
  const tabs = await chrome.tabs.query({ url: SSB_URL_PATTERN });
  return tabs[0]?.id ?? null;
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
  return sendTabMessage(tabId, msg);
}

function isSSBMessage(type: string): boolean {
  return type.startsWith("SSB_");
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
  onMessage(async (msg, sendResponse) => {
    try {
      if (isSSBMessage(msg.type)) {
        const result = await relayToSSBTab(msg);
        sendResponse(result);
        return;
      }

      const customBaseUrl = await getStorageItem<string>("betterssb:apiUrl");
      if (customBaseUrl) api.setBaseUrl(customBaseUrl);

      switch (msg.type) {
        case "SEARCH_SCHOOLS": {
          const { query } = msg.payload as { query: string };
          const schools = await api.searchSchools(query);
          sendResponse({ success: true, data: schools });
          break;
        }

        case "FETCH_RATING": {
          const { name, school } = msg.payload as {
            name: string;
            school: string;
          };
          const ratings = await api.searchProfessor(name, school);
          const rating = ratings.length > 0 ? ratings[0] : null;
          sendResponse({ success: true, data: rating });
          break;
        }

        case "GENERATE_SCHEDULE": {
          const { sections, preferences } = msg.payload as {
            sections: Section[];
            preferences: SchedulePreferences;
          };
          const schedules = await api.generateSchedules(sections, preferences);
          sendResponse({ success: true, data: schedules });
          break;
        }

        case "CHAT": {
          const { messages, context } = msg.payload as {
            messages: ChatMessage[];
            context?: string;
          };
          const reply = await api.chat(messages, context);
          sendResponse({ success: true, data: reply });
          break;
        }

        case "PARSE_TRANSCRIPT": {
          const { text } = msg.payload as { text: string };
          const transcript = await api.parseTranscript(text);
          sendResponse({ success: true, data: transcript });
          break;
        }

        case "CHECK_PREREQS": {
          const { completed, required } = msg.payload as {
            completed: TranscriptCourse[];
            required: string[];
          };
          const result = await api.checkPrerequisites(completed, required);
          sendResponse({ success: true, data: result });
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

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (
      AUTO_REG_RUN_STATE_KEY in changes ||
      AUTO_REG_SCHEDULE_CONFIG_KEY in changes
    ) {
      void syncAutoRegFireAlarm();
    }
  });

  chrome.alarms.create(REG_CHECK_ALARM, { periodInMinutes: 1 });

  chrome.alarms.onAlarm.addListener(async (alarm) => {
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
        chrome.notifications.create("betterssb-reg-reminder", {
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
      await chrome.alarms.clear(AUTO_REG_FIRE_ALARM);
      chrome.notifications.create("betterssb-reg-done", {
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
      await chrome.alarms.clear(AUTO_REG_FIRE_ALARM);
      chrome.notifications.create("betterssb-reg-fail", {
        type: "basic",
        iconUrl: "icon/128.png",
        title: "Auto-register failed",
        message: err.slice(0, 220),
        priority: 2,
      });
    }
  });
});
