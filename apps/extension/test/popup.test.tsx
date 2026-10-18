import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { mockApi } from "@workspace/api-client/testing";
import {
  addSection,
  emptyPlan,
  plannedSectionFrom,
} from "@workspace/shared/lib/plan";
import { DEFAULT_SETTINGS } from "@workspace/shared/lib/store";
import { sampleAudit } from "@workspace/shared/testing/audit";
import { classSection } from "@workspace/shared/testing/class-section";
import type { AutoRegSnapshot } from "@workspace/shared/types/auto-reg";
import type { StoreDocuments, StoreKey } from "@workspace/shared/types/store";
import { axeViolations } from "@workspace/ui/test/axe";
import { extensionStore } from "@/lib/local-store";
import { answerBackground, renderPopup } from "./popup";

const NOW = "2026-10-17T12:00:00.000Z";
const SPRING = { code: "202703", description: "2027 Spring" };
const TEMPLE = { id: "U2Nob29sLTk5OQ==", name: "Temple University" };
const NOT_ARMED: AutoRegSnapshot = {
  term: "202703",
  crns: [],
  scheduledRunAt: "",
  armed: false,
  lastResult: null,
};

async function seed<K extends StoreKey>(key: K, value: StoreDocuments[K]) {
  await extensionStore.set(key, value);
}

async function signedUp() {
  await seed("settings", {
    ...DEFAULT_SETTINGS,
    school: TEMPLE,
    term: "202703",
    updatedAt: NOW,
  });
}

function api() {
  return mockApi({
    "GET /api/classes/terms": [SPRING],
    "GET /api/classes/subjects": [{ code: "CIS", description: "CIS" }],
    "GET /api/classes/search": {
      totalCount: 1,
      fetchedAt: NOW,
      sections: [classSection()],
    },
    "GET /api/rmp/search": [],
    "GET /api/rmp/schools": [{ ...TEMPLE, legacyId: 999 }],
  });
}

function background(snapshot: Partial<AutoRegSnapshot> = {}) {
  return answerBackground({
    AUTOREG_GET: () => ({ ...NOT_ARMED, ...snapshot }),
    AUTOREG_DISARM: () => undefined,
    BANNER_STATUS: () => "connected",
  });
}

describe("popup", () => {
  it("asks for a school on first run and saves it to the shared settings", async () => {
    const user = userEvent.setup();
    api();
    background();
    renderPopup();
    expect(await screen.findByText("Welcome to BetterSSB")).toBeTruthy();
    await user.type(
      screen.getByRole("combobox", { name: "Your school" }),
      "Temple",
    );
    await user.click(
      await screen.findByRole("option", { name: "Temple University" }),
    );
    await user.click(screen.getByRole("button", { name: "Get started" }));
    await waitFor(async () =>
      expect((await extensionStore.get("settings"))?.school).toEqual(TEMPLE),
    );
    expect(
      await screen.findByRole("navigation", { name: "Popup sections" }),
    ).toBeTruthy();
  });

  it("shows the armed countdown on Today and disarms", async () => {
    const user = userEvent.setup();
    api();
    const sent = background({
      armed: true,
      crns: ["41207", "41311"],
      scheduledRunAt: "2030-11-14T07:00",
    });
    await signedUp();
    renderPopup();
    expect(await screen.findByText(/Armed · Nov 14/)).toBeTruthy();
    expect(
      screen.getByText("2 CRNs queued · keep this computer awake"),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Disarm" }));
    await waitFor(() =>
      expect(sent.map((m) => m.type)).toContain("AUTOREG_DISARM"),
    );
  });

  it("lists the term's plan with live seats", async () => {
    api();
    background();
    await signedUp();
    await seed(
      "plan:202703",
      addSection(
        emptyPlan("202703", "Spring 2027"),
        plannedSectionFrom(classSection(), NOW),
        NOW,
      ),
    );
    renderPopup();
    expect(await screen.findByText("CIS 2168 · 001")).toBeTruthy();
    expect(await screen.findByText("12 open")).toBeTruthy();
  });

  it("searches and adds a section to the plan", async () => {
    const user = userEvent.setup();
    api();
    background();
    await signedUp();
    renderPopup();
    await user.click(await screen.findByRole("button", { name: "Search" }));
    await user.type(
      screen.getByRole("searchbox", { name: "Search sections" }),
      "CIS 2168",
    );
    await user.click(
      await screen.findByRole(
        "button",
        { name: "Add CIS 2168 001 to plan" },
        { timeout: 3_000 },
      ),
    );
    await waitFor(async () =>
      expect(
        (await extensionStore.get("plan:202703"))?.sections.map((s) => s.crn),
      ).toEqual(["41207"]),
    );
  });

  it("sends arming to the website from Register", async () => {
    const user = userEvent.setup();
    api();
    background({ crns: ["41207"] });
    await signedUp();
    const create = vi.spyOn(fakeBrowser.tabs, "create");
    renderPopup();
    await user.click(await screen.findByRole("button", { name: "Register" }));
    expect(await screen.findByText("CRN 41207")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Arm in BetterSSB/ }));
    expect(create).toHaveBeenCalledWith({
      url: "http://localhost:5173/register",
    });
  });

  it("summarizes the saved audit", async () => {
    const user = userEvent.setup();
    api();
    background();
    await signedUp();
    await seed("audit", { audit: sampleAudit(), storedAt: NOW });
    renderPopup();
    await user.click(await screen.findByRole("button", { name: "Audit" }));
    const needed = await screen.findByRole("heading", { name: /Still needed/ });
    expect(
      within(needed.parentElement!).getByText("Writing intensive"),
    ).toBeTruthy();
    expect(screen.getByText("Computer Science BS")).toBeTruthy();
  });

  it("has no accessibility violations on Today", async () => {
    api();
    background();
    await signedUp();
    const { container } = renderPopup();
    await screen.findByText("Spring 2027 plan");
    expect(await axeViolations(container)).toEqual([]);
  });
});
