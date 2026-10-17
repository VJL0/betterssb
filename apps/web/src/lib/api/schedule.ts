import type {
  GeneratedSchedule,
  SchedulePreferences,
  Section,
} from "@workspace/shared/types";
import { postJson } from "./http";

/** Conflict-free schedules for the given meeting blocks, best first. */
export function generateSchedules(
  sections: Section[],
  preferences: SchedulePreferences,
  maxResults: number,
  signal?: AbortSignal,
): Promise<GeneratedSchedule[]> {
  return postJson(
    "/schedule/generate",
    { sections, preferences, maxResults },
    { signal, errorMessage: "Couldn't generate schedules." },
  );
}
