import { useState } from "react";
import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import {
  generateSchedules,
  type GeneratedSchedule,
  type SectionOutput as Section,
} from "@workspace/api-client";

/** The schedule service's cap. */
export const MAX_SCHEDULES = 50;
const GENERATION = "generatedSchedules";
const NO_SCHEDULES: GeneratedSchedule[] = [];

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
  /** Changes with every new input, so the loading timer restarts. */
  runKey: string;
  cancel: () => void;
  retry: () => void;
}

interface Generated {
  schedules: GeneratedSchedule[];
  widened: GeneratedSchedule[];
}

async function run(
  sections: readonly Section[],
  signal: AbortSignal,
): Promise<GeneratedSchedule[]> {
  if (sections.length === 0) return [];
  const { data } = await generateSchedules({
    body: {
      sections: [...sections],
      preferences: {},
      maxResults: MAX_SCHEDULES,
    },
    signal,
    meta: { errorMessage: "Couldn't generate schedules." },
  });
  return data;
}

async function generate(
  meetings: readonly Section[],
  widenedMeetings: readonly Section[] | null,
  signal: AbortSignal,
): Promise<Generated> {
  const schedules = await run(meetings, signal);
  const widened =
    schedules.length === 0 && widenedMeetings
      ? await run(widenedMeetings, signal)
      : NO_SCHEDULES;
  return { schedules, widened };
}

/** The most recent earlier run that found schedules, from the query cache. */
function lastGood(queryClient: QueryClient): GeneratedSchedules["last"] {
  const [latest] = queryClient
    .getQueryCache()
    .findAll({ queryKey: [GENERATION] })
    .filter(
      (q) =>
        q.state.status === "success" &&
        (q.state.data as Generated).schedules.length > 0,
    )
    .sort((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt);
  if (!latest) return null;
  return {
    schedules: (latest.state.data as Generated).schedules,
    at: new Date(latest.state.dataUpdatedAt).toISOString(),
  };
}

/**
 * Conflict-free schedules from the schedule service for `meetings`. When
 * there are none and `widenedMeetings` is given, a run with those shows what
 * a looser day rule would allow. It's a POST, but a pure function of its
 * input, so it's a query: cached by input and cancellable.
 */
export function useGeneratedSchedules(
  meetings: readonly Section[],
  widenedMeetings: readonly Section[] | null,
): GeneratedSchedules {
  const queryClient = useQueryClient();
  const [cancelledKey, setCancelledKey] = useState<string | null>(null);
  const nothingToTry = meetings.length === 0 && !widenedMeetings?.length;
  const queryKey = [GENERATION, meetings, widenedMeetings] as const;
  const runKey = JSON.stringify(queryKey);
  const cancelled = cancelledKey === runKey;

  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => generate(meetings, widenedMeetings, signal),
    enabled: !nothingToTry && !cancelled,
    staleTime: Infinity,
  });

  const base = {
    runKey,
    last: query.isError ? lastGood(queryClient) : null,
    cancel: () => {
      setCancelledKey(runKey);
      void queryClient.cancelQueries({ queryKey });
    },
    retry: () => {
      if (cancelled) setCancelledKey(null);
      else void query.refetch();
    },
  };
  const empty = { schedules: NO_SCHEDULES, widened: NO_SCHEDULES };

  if (nothingToTry) return { ...base, ...empty, status: "idle" };
  if (cancelled) return { ...base, ...empty, status: "cancelled" };
  if (query.isFetching) return { ...base, ...empty, status: "loading" };
  if (query.isError) return { ...base, ...empty, status: "error" };
  if (query.isSuccess) return { ...base, ...query.data, status: "ready" };
  return { ...base, ...empty, status: "loading" };
}
