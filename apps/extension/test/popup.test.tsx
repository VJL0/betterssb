import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import type { AutoRegSnapshot } from "@workspace/shared/types/auto-reg";
import type { BannerConnection } from "@workspace/shared/types/store";
import { axeViolations } from "@workspace/ui/test/axe";
import { extensionStore } from "@/lib/local-store";
import { BANNER_ORIGIN } from "@/lib/temple-urls";
import { answerBackground, renderPopup } from "./popup";

const NOT_ARMED: AutoRegSnapshot = {
  term: "202703",
  crns: [],
  scheduledRunAt: "",
  armed: false,
  lastResult: null,
};

function background({
  banner = "connected",
  snapshot = {},
}: {
  banner?: BannerConnection;
  snapshot?: Partial<AutoRegSnapshot>;
} = {}) {
  return answerBackground({
    AUTOREG_GET: () => ({ ...NOT_ARMED, ...snapshot }),
    BANNER_STATUS: () => banner,
  });
}

describe("popup", () => {
  it("shows the Banner sign-in and opens the website", async () => {
    const user = userEvent.setup();
    background();
    const create = vi.spyOn(fakeBrowser.tabs, "create");
    renderPopup();
    expect(await screen.findByText("Signed in to Banner")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Open BetterSSB" }));
    expect(create).toHaveBeenCalledWith({
      url: "http://localhost:3000/search",
    });
  });

  it("offers a sign-in when Banner signed the student out", async () => {
    background({ banner: "signed-out" });
    renderPopup();
    expect(await screen.findByText("Signed out of Banner")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Sign in to Banner" }),
    ).toBeTruthy();
  });

  it("shows when an armed run will register", async () => {
    background({
      snapshot: {
        armed: true,
        crns: ["41207"],
        scheduledRunAt: "2030-11-14T07:00",
      },
    });
    renderPopup();
    expect(
      await screen.findByText("Auto-register set for Nov 14, 7:00 AM"),
    ).toBeTruthy();
  });

  it("lists the requests sent with the student's sign-in", async () => {
    background();
    const today = (hour: number, minute: number) => {
      const date = new Date();
      date.setHours(hour, minute, 0, 0);
      return date.toISOString();
    };
    await extensionStore.set("requestLog", {
      updatedAt: today(14, 14),
      entries: [
        {
          method: "GET",
          url: `${BANNER_ORIGIN}/StudentRegistrationSsb/ssb/searchResults/getSectionDetailsFromCRN?courseReferenceNumber=41207&term=202703`,
          status: 500,
          at: today(14, 14),
        },
        {
          method: "GET",
          url: `${BANNER_ORIGIN}/StudentRegistrationSsb/ssb/selfServiceMenu/data`,
          status: 200,
          at: today(9, 30),
          count: 31,
        },
      ],
    });
    renderPopup();
    const failed = await screen.findByText("getSectionDetailsFromCRN");
    expect(within(failed.closest("li")!).getByText("500").className).toContain(
      "text-destructive",
    );
    expect(screen.getByText("data")).toBeTruthy();
    expect(screen.getByText("Banner · 9:30 AM · 31 times")).toBeTruthy();
  });

  it("has no accessibility violations", async () => {
    background();
    const { container } = renderPopup();
    await screen.findByText("Signed in to Banner");
    expect(await axeViolations(container)).toEqual([]);
  });
});
