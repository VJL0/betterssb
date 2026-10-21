import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RmpRating } from "@workspace/api-client";
import {
  API,
  http,
  HttpResponse,
  problemResponse,
  server,
} from "@workspace/api-client/testing";
import { createQueryClient } from "@/lib/query-client";
import { useRatings } from "./use-ratings";

const INSTRUCTOR = "Liao, Cindy";

const RATING: RmpRating = {
  professorName: "Cindy Liao",
  department: "Computer Science",
  overallRating: 4.5,
  wouldTakeAgainPct: 90,
  difficulty: 3,
  numRatings: 12,
  topTags: [],
  rmpUrl: "https://www.ratemyprofessors.com/professor/7",
};

/** How long the hook waits between lookups while the API's first sync runs. */
const SYNC_RETRY_DELAY_MS = 10_000;

function renderRatings() {
  const queryClient = createQueryClient();
  return renderHook(() => useRatings([INSTRUCTOR]), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
}

/** Answers 503 until `synced` is called, as the API does before its first sync. */
function rosterSyncingUntilCalled(): { synced: () => void } {
  let ready = false;
  server.use(
    http.get(`${API}/rmp/search`, () =>
      ready ? HttpResponse.json([RATING]) : problemResponse(503),
    ),
  );
  return { synced: () => (ready = true) };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("useRatings", () => {
  it("reports the first roster sync and fills in ratings once it lands", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const roster = rosterSyncingUntilCalled();
    const { result } = renderRatings();

    await waitFor(() => expect(result.current.syncing).toBe(true));
    expect(result.current.byName.get(INSTRUCTOR)).toBeUndefined();

    roster.synced();
    await act(() => vi.advanceTimersByTimeAsync(SYNC_RETRY_DELAY_MS));

    await waitFor(() =>
      expect(result.current.byName.get(INSTRUCTOR)).toEqual(RATING),
    );
    expect(result.current.syncing).toBe(false);
  });

  it("shows other failures as no profile without waiting", async () => {
    server.use(http.get(`${API}/rmp/search`, () => problemResponse(404)));
    const { result } = renderRatings();

    await waitFor(() =>
      expect(result.current.byName.get(INSTRUCTOR)).toBe(null),
    );
    expect(result.current.syncing).toBe(false);
  });
});
