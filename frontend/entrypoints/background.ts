import { api } from "@/lib/api";
import { onMessage, sendTabMessage } from "@/lib/messaging";
import type { ExtensionMessage, ExtensionResponse } from "@/lib/messaging";
import { getStorageItem } from "@/lib/storage";
import type {
  Section,
  SchedulePreferences,
  ChatMessage,
  TranscriptCourse,
} from "@/types";

const SSB_URL_PATTERN = "*://*.edu/StudentRegistrationSsb/*";

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

  chrome.alarms.create("betterssb-reg-check", { periodInMinutes: 1 });

  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== "betterssb-reg-check") return;

    const targetTime = await getStorageItem<string>(
      "betterssb:registrationTime",
    );
    if (!targetTime) return;

    const target = new Date(targetTime).getTime();
    const now = Date.now();
    const diffMinutes = (target - now) / 60_000;

    if (diffMinutes > 0 && diffMinutes <= 5) {
      chrome.notifications.create("betterssb-reg-reminder", {
        type: "basic",
        iconUrl: "icon/128.png",
        title: "Registration Opening Soon!",
        message: `Your registration window opens in ~${Math.ceil(diffMinutes)} minute${Math.ceil(diffMinutes) === 1 ? "" : "s"}.`,
        priority: 2,
      });
    }
  });
});
