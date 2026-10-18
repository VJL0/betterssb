import { useCallback, useEffect, useState } from "react";
import type { GeneratedSchedule, Section } from "@workspace/shared/types";
import { generateSchedules } from "@/lib/api/schedule";

/** The schedule service's cap. */
export const MAX_SCHEDULES = 50;

export type GenerationStatus =
  "idle" | "loading" | "ready" | "error" | "cancelled";

export interface GeneratedSchedules {
  status: GenerationStatus;
  schedules: GeneratedSchedule[];
  /**
   * With no result under the day rule: schedules with every day allowed,
   * for suggesting a day to turn back on. Empty otherwise.
   */
  widened: GeneratedSchedule[];
  /** The last good result, kept on screen when a later run fails. */
  last: { schedules: GeneratedSchedule[]; at: string } | null;
  /** Bumps on every new run, so the loading timer restarts. */
  runKey: string;
  cancel: () => void;
  retry: () => void;
}

interface Response {
  key: string;
  schedules: GeneratedSchedule[];
  widened: GeneratedSchedule[];
  failed: boolean;
}

// One shared empty list, so callers' memos don't rerun while nothing has loaded.
const NO_SCHEDULES: GeneratedSchedule[] = [];
const NONE: Response = {
  key: "",
  schedules: NO_SCHEDULES,
  widened: NO_SCHEDULES,
  failed: false,
};

/**
 * Conflict-free schedules from the schedule service for `meetings`. When
 * there are none and `widenedMeetings` is given, a run with those shows what
 * a looser day rule would allow.
 */
export function useGeneratedSchedules(
  meetings: readonly Section[],
  widenedMeetings: readonly Section[] | null,
): GeneratedSchedules {
  const [attempt, setAttempt] = useState(0);
  const [response, setResponse] = useState<Response>(NONE);
  const [cancelledKey, setCancelledKey] = useState<string | null>(null);
  const [last, setLast] = useState<GeneratedSchedules["last"]>(null);
  const key = `${attempt}|${JSON.stringify(meetings)}|${widenedMeetings ? JSON.stringify(widenedMeetings) : ""}`;

  const nothingToTry = meetings.length === 0 && !widenedMeetings?.length;

  useEffect(() => {
    if (nothingToTry || cancelledKey === key) return;
    const controller = new AbortController();
    const { signal } = controller;
    const run = async () => {
      const schedules = meetings.length
        ? await generateSchedules([...meetings], {}, MAX_SCHEDULES, signal)
        : [];
      const widened =
        schedules.length === 0 && widenedMeetings?.length
          ? await generateSchedules(
              [...widenedMeetings],
              {},
              MAX_SCHEDULES,
              signal,
            )
          : [];
      return { schedules, widened };
    };
    run().then(
      ({ schedules, widened }) => {
        if (signal.aborted) return;
        setResponse({ key, schedules, widened, failed: false });
        if (schedules.length > 0) {
          setLast({ schedules, at: new Date().toISOString() });
        }
      },
      () => {
        if (signal.aborted) return;
        setResponse({ ...NONE, key, failed: true });
      },
    );
    return () => controller.abort();
    // `key` covers the meetings and retries.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, cancelledKey]);

  const cancel = useCallback(() => setCancelledKey(key), [key]);
  const retry = useCallback(() => {
    setCancelledKey(null);
    setAttempt((n) => n + 1);
  }, []);

  const base = { last, runKey: key, cancel, retry };
  if (nothingToTry) {
    return {
      ...base,
      status: "idle",
      schedules: NO_SCHEDULES,
      widened: NO_SCHEDULES,
    };
  }
  if (cancelledKey === key) {
    return {
      ...base,
      status: "cancelled",
      schedules: NO_SCHEDULES,
      widened: NO_SCHEDULES,
    };
  }
  if (response.key !== key) {
    return {
      ...base,
      status: "loading",
      schedules: NO_SCHEDULES,
      widened: NO_SCHEDULES,
    };
  }
  return {
    ...base,
    status: response.failed ? "error" : "ready",
    schedules: response.schedules,
    widened: response.widened,
  };
}
