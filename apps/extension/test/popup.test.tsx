import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import type { AutoRegSnapshot } from "@workspace/shared/types/auto-reg";
import type { BannerConnection } from "@workspace/shared/types/store";
import { axeViolations } from "@workspace/ui/test/axe";
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

  it("has no accessibility violations", async () => {
    background();
    const { container } = renderPopup();
    await screen.findByText("Signed in to Banner");
    expect(await axeViolations(container)).toEqual([]);
  });
});
