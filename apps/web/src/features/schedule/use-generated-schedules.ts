import { useState } from "react";
import {
  queryOptions,
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

/**
 * A POST, but a pure function of its input, so it's a query: cached by input
 * and cancellable. The same input always gives the same schedules.
 */
function generationOptions(
  meetings: readonly Section[],
  widenedMeetings: readonly Section[] | null,
) {
  return queryOptions({
    queryKey: [GENERATION, meetings, widenedMeetings],
    queryFn: ({ signal }) => generate(meetings, widenedMeetings, signal),
    staleTime: "static",
  });
}

/** The most recent earlier run that found schedules, from the query cache. */
function lastGood(queryClient: QueryClient): GeneratedSchedules["last"] {
  let latest: { schedules: GeneratedSchedule[]; updatedAt: number } | null =
    null;
  for (const [queryKey, data] of queryClient.getQueriesData<Generated>({
    queryKey: [GENERATION],
  })) {
    if (!data?.schedules.length) continue;
    const updatedAt = queryClient.getQueryState(queryKey)?.dataUpdatedAt ?? 0;
    if (!latest || updatedAt > latest.updatedAt) {
      latest = { schedules: data.schedules, updatedAt };
    }
  }
  return latest
    ? {
        schedules: latest.schedules,
        at: new Date(latest.updatedAt).toISOString(),
      }
    : null;
}

/**
 * Conflict-free schedules from the schedule service for `meetings`. When
 * there are none and `widenedMeetings` is given, a run with those shows what
 * a looser day rule would allow.
 */
export function useGeneratedSchedules(
  meetings: readonly Section[],
  widenedMeetings: readonly Section[] | null,
): GeneratedSchedules {
  const queryClient = useQueryClient();
  const [cancelledKey, setCancelledKey] = useState<string | null>(null);
  const nothingToTry = meetings.length === 0 && !widenedMeetings?.length;
  const options = generationOptions(meetings, widenedMeetings);
  const { queryKey } = options;
  const runKey = JSON.stringify(queryKey);
  const cancelled = cancelledKey === runKey;

  const query = useQuery({
    ...options,
    enabled: !nothingToTry && !cancelled,
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
