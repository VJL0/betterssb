import { act, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RmpRating } from "@workspace/api-client";
import { DEFAULT_SETTINGS } from "@workspace/shared/lib/store";
import { extensionStore } from "@/lib/local-store";
import { bannerResultsHtml, bannerRowsHtml } from "@/test/banner-results";
import { answerBackground } from "@/test/popup";
import { OverlayApp } from "./overlay-app";
import { createRatingSlotWatcher } from "./rating-slots";
import {
  createShadowHost,
  HOST_TAG,
  LAYER_SLOT,
  RATING_SLOT,
} from "./shadow-host";

const NOW = "2026-10-17T12:00:00.000Z";

const LOVELACE: RmpRating = {
  professorName: "Ada Lovelace",
  department: "Computer Science",
  overallRating: 4.4,
  difficulty: 3.1,
  numRatings: 52,
  wouldTakeAgainPct: 88,
  topTags: ["Clear grading"],
  rmpUrl: "https://www.ratemyprofessors.com/professor/1",
} as RmpRating;

async function seedSettings(bannerOverlay = true) {
  await extensionStore.set("settings", {
    ...DEFAULT_SETTINGS,
    bannerOverlay,
    updatedAt: NOW,
  });
}

/** What each rating host renders, in page order. */
function ratings(): HTMLElement[] {
  return [
    ...document.querySelectorAll<HTMLElement>(
      `${HOST_TAG}[data-slot="${RATING_SLOT}"]`,
    ),
  ].map((host) => host.shadowRoot!.lastElementChild as HTMLElement);
}

function renderOverlay() {
  const layer = createShadowHost("", LAYER_SLOT, "block");
  document.body.append(layer.host);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <OverlayApp
        watcher={createRatingSlotWatcher("")}
        popupContainer={layer.container}
      />
    </QueryClientProvider>,
    // As in production: the app lives in the page-level layer.
    { container: layer.container },
  );
}

describe("Banner overlay", () => {
  beforeEach(() => {
    document.body.innerHTML = bannerResultsHtml([
      ["Ada Lovelace", "Alan Turing"],
      [],
    ]);
    answerBackground({
      FETCH_RATING: ({ name }) => (name === "Ada Lovelace" ? LOVELACE : null),
    });
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("adds a rating before each instructor", async () => {
    await seedSettings();
    renderOverlay();
    await waitFor(() => expect(ratings()).toHaveLength(2));
    const [lovelace, turing] = ratings();
    await waitFor(() =>
      expect(lovelace!.textContent).toMatch(/^4\.4 rating for Ada Lovelace/),
    );
    await waitFor(() => expect(turing!.textContent).toBe("No RMP"));
    expect(turing!.querySelector("a")?.getAttribute("aria-label")).toMatch(
      /^No RMP profile, search Rate My Professors for Alan Turing/,
    );
    // Right before Banner's own link, inside the same cell.
    const link = document.querySelector("a.email")!;
    expect(link.previousElementSibling?.localName).toBe(HOST_TAG);
  });

  it("adds nothing when the setting is off, and clears up when it's turned off", async () => {
    await seedSettings(false);
    renderOverlay();
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(ratings()).toHaveLength(0);
    await act(() => seedSettings(true));
    await waitFor(() => expect(ratings()).toHaveLength(2));
    await act(() => seedSettings(false));
    await waitFor(() => expect(ratings()).toHaveLength(0));
  });

  it("follows Banner when it renders another page of results", async () => {
    await seedSettings();
    renderOverlay();
    await waitFor(() => expect(ratings()).toHaveLength(2));
    document.querySelector("tbody")!.innerHTML = bannerRowsHtml([
      ["Grace Hopper"],
    ]);
    await waitFor(() => expect(ratings()).toHaveLength(1));
  });
});
