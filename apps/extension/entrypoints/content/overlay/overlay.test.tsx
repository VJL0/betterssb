import { act, render, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RmpRating } from "@workspace/api-client";
import { emptyPlan } from "@workspace/shared/lib/plan";
import { DEFAULT_SETTINGS, planKey } from "@workspace/shared/lib/store";
import type { PlannedSection } from "@workspace/shared/types/store";
import { extensionStore } from "@/lib/local-store";
import { overlayStatus } from "@/lib/overlay-status";
import { bannerResultsHtml } from "@/test/banner-results";
import { answerBackground } from "@/test/popup";
import { OverlayApp } from "./overlay-app";
import { createRowWatcher } from "./row-watcher";
import { createShadowHost, HOST_TAG, LAYER_SLOT } from "./shadow-host";

const NOW = "2026-10-17T12:00:00.000Z";
const TERM = "202703";

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

function plannedSection(
  crn: string,
  courseCode: string,
  days: string,
  start: number,
  end: number,
): PlannedSection {
  return {
    crn,
    courseId: courseCode.replace(" ", ""),
    courseCode,
    section: "001",
    title: "",
    credits: 4,
    scheduleType: "Lecture",
    instructor: "",
    meetings: [
      { days, start, end, location: "", startDate: null, endDate: null },
    ],
    addedAt: NOW,
  };
}

async function seedSettings(bannerOverlay = true) {
  await extensionStore.set("settings", {
    ...DEFAULT_SETTINGS,
    school: { id: "U2Nob29sLTk5OQ==", name: "Temple University" },
    term: TERM,
    bannerOverlay,
    updatedAt: NOW,
  });
}

async function seedPlan(sections: PlannedSection[]) {
  await extensionStore.set(planKey(TERM), {
    ...emptyPlan(TERM, "2027 Spring"),
    sections,
    colorOrder: Object.fromEntries(sections.map((s, i) => [s.courseId, i])),
  });
}

/** The rendered content of every overlay host of a slot, in page order. */
function slotsOf(slot: string): HTMLElement[] {
  return [
    ...document.querySelectorAll<HTMLElement>(
      `${HOST_TAG}[data-slot="${slot}"]`,
    ),
  ].map((host) => host.shadowRoot!.lastElementChild as HTMLElement);
}

function renderOverlay() {
  const layer = createShadowHost("", LAYER_SLOT, "block");
  document.body.append(layer.host);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <OverlayApp
        watcher={createRowWatcher("")}
        popupContainer={layer.container}
      />
    </QueryClientProvider>,
    // As in production: the app lives in the page-level layer.
    { container: layer.container },
  );
  return { ...view, dock: () => within(layer.container) };
}

describe("Banner overlay", () => {
  beforeEach(() => {
    document.body.innerHTML = bannerResultsHtml([
      {
        id: "1",
        crn: "41207",
        course: "CIS 2168",
        section: "001",
        seats: [12, 30],
        instructors: ["Ada Lovelace"],
      },
      {
        id: "2",
        crn: "50001",
        course: "CIS 2107",
        section: "002",
        seats: [0, 24],
        waitlist: [6, 10],
        instructors: ["Alan Turing"],
        meetings: [
          { days: ["Tuesday", "Thursday"], time: "10:00 AM - 11:20 AM" },
        ],
      },
    ]);
    answerBackground({
      FETCH_RATING: (payload) =>
        (payload as { name: string }).name === "Ada Lovelace" ? LOVELACE : null,
    });
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("adds a rating beside each instructor", async () => {
    await seedSettings();
    renderOverlay();
    await waitFor(() => expect(slotsOf("rating")).toHaveLength(2));
    const [lovelace, turing] = slotsOf("rating");
    await waitFor(() =>
      expect(lovelace!.textContent).toMatch(/^4\.4 rating for Ada Lovelace/),
    );
    await waitFor(() => expect(turing!.textContent).toBe("No RMP profile"));
    // Right before Banner's own link, inside the same cell.
    const link = document.querySelector("a.email")!;
    expect(link.previousElementSibling?.localName).toBe(HOST_TAG);
  });

  it("puts a seat meter under Banner's seat text, keeping the text", async () => {
    await seedSettings();
    renderOverlay();
    await waitFor(() => expect(slotsOf("seats")).toHaveLength(2));
    const [open, full] = slotsOf("seats");
    expect(open!.textContent).toContain("12 open");
    expect(full!.textContent).toContain("Full · waitlist 4/10");
    const status = document.querySelector('td[data-property="status"]')!;
    expect(status.textContent).toContain("12 of 30 seats remain.");
  });

  it("tags planned and conflicting sections", async () => {
    await seedSettings();
    await seedPlan([plannedSection("41207", "CIS 2168", "TR", 570, 650)]);
    renderOverlay();
    await waitFor(() =>
      expect(slotsOf("tags")[0]!.textContent).toBe("In your plan"),
    );
    expect(slotsOf("tags")[1]!.textContent).toBe(
      "Conflicts with your plan: overlaps CIS 2168 · 001, TR 10:00",
    );
    expect(overlayStatus()).toEqual({ sections: 2, inPlan: 1 });
  });

  it("shows the plan and this page's conflicts in the dock", async () => {
    const user = userEvent.setup();
    await seedSettings();
    await seedPlan([plannedSection("41207", "CIS 2168", "TR", 570, 650)]);
    const { dock } = renderOverlay();
    const toggle = await dock().findByRole("button", {
      name: /Spring plan · 4 cr/,
    });
    expect(toggle.textContent).toContain("1 conflict");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    await user.click(toggle);
    expect(
      dock().getByText(
        "CIS 2107 · 002 on this page overlaps CIS 2168 · 001, TR 10:00.",
      ),
    ).toBeTruthy();
    expect(
      dock()
        .getByRole("link", { name: "Open in BetterSSB" })
        .getAttribute("href"),
    ).toBe("http://localhost:3000/plan");
  });

  it("adds nothing when the setting is off, and clears up when it's turned off", async () => {
    await seedSettings(false);
    await seedPlan([plannedSection("41207", "CIS 2168", "TR", 570, 650)]);
    renderOverlay();
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(document.querySelectorAll(HOST_TAG)).toHaveLength(1); // the layer
    await act(() => seedSettings(true));
    await waitFor(() => expect(slotsOf("seats")).toHaveLength(2));
    await act(() => seedSettings(false));
    await waitFor(() =>
      expect(
        document.querySelectorAll(`${HOST_TAG}:not([data-slot="layer"])`),
      ).toHaveLength(0),
    );
  });

  it("follows Banner when it renders another page of results", async () => {
    await seedSettings();
    renderOverlay();
    await waitFor(() => expect(slotsOf("seats")).toHaveLength(2));
    document.querySelector("tbody")!.innerHTML = bannerResultsHtml([
      { id: "9", crn: "60000", course: "MATH 1041", section: "001" },
    ]).replace(/^[\s\S]*<tbody>|<\/tbody>[\s\S]*$/g, "");
    await waitFor(() => expect(slotsOf("seats")).toHaveLength(1));
  });
});
