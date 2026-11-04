import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryError } from "@workspace/api-client";
import {
  createSeatWatchMutation,
  deleteSeatWatchMutation,
  listSeatWatchesOptions,
  listSeatWatchesQueryKey,
} from "@workspace/api-client/query";

/** The scheduled check runs every minute; this keeps the list about as fresh. */
const REFRESH_MS = 60_000;

/** The signed-in student's watched sections. */
export function useSeatWatches() {
  return useQuery({
    ...listSeatWatchesOptions({
      meta: { errorMessage: "Couldn't load your seat tracker." },
    }),
    refetchInterval: REFRESH_MS,
  });
}

function useRefreshWatches() {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({ queryKey: listSeatWatchesQueryKey() });
}

export function useWatchCrn() {
  const refresh = useRefreshWatches();
  return useMutation({
    ...createSeatWatchMutation({
      meta: { errorMessage: "Couldn't watch that CRN." },
    }),
    onSuccess: refresh,
  });
}

export function useStopWatching() {
  const refresh = useRefreshWatches();
  return useMutation({
    ...deleteSeatWatchMutation({
      meta: { errorMessage: "Couldn't stop watching that CRN." },
    }),
    onSuccess: refresh,
    onError: (error) => toast.error(queryError(error)?.message),
  });
}
