import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { axeViolations } from "@workspace/ui/test/axe";
import { renderPage } from "@/test/render";
import { exportStore } from "./export-data";
import { SettingsPage } from "./settings-page";

afterEach(() => {
  vi.unstubAllGlobals();
});

const THREAD = {
  id: "t1",
  title: "Electives",
  messages: [{ role: "user" as const, content: "Which electives?" }],
  updatedAt: "2026-10-17T00:00:00.000Z",
};

describe("SettingsPage", () => {
  it("explains guest mode and that Banner needs the extension", async () => {
    renderPage(<SettingsPage />);
    expect(await screen.findByText("Using BetterSSB as a guest")).toBeTruthy();
    expect(
      screen.getByText(/need the BetterSSB Chrome extension/),
    ).toBeTruthy();
    expect(
      screen.getByText("Your data is saved in this browser."),
    ).toBeTruthy();
  });

  it("clears advisor history only after confirming", async () => {
    const user = userEvent.setup();
    const { store } = renderPage(<SettingsPage />);
    await store.set("advisorThreads", [THREAD]);
    const clear = await screen.findByRole("button", {
      name: "Clear advisor history",
    });
    await waitFor(() => expect(clear.hasAttribute("disabled")).toBe(false));

    await user.click(clear);
    await user.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(await store.get("advisorThreads")).not.toBeNull();

    await user.click(clear);
    await user.click(
      await screen.findByRole("button", { name: "Clear history" }),
    );
    await waitFor(async () =>
      expect(await store.get("advisorThreads")).toBeNull(),
    );
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });

  it("clears everything on the device", async () => {
    const user = userEvent.setup();
    const { store } = renderPage(<SettingsPage />);
    await store.set("advisorThreads", [THREAD]);
    await store.set("settings", {
      term: "202703",
      major: "",
      startTerm: null,
      program: null,
      keyboardShortcuts: true,
      bannerOverlay: true,
      updatedAt: "2026-10-17T00:00:00.000Z",
    });
    await user.click(
      await screen.findByRole("button", { name: "Clear this device" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Clear everything" }),
    );
    await waitFor(async () => expect(await store.keys()).toEqual([]));
  });

  it("has no axe violations", async () => {
    const { container } = renderPage(<SettingsPage />);
    await screen.findByText("Using BetterSSB as a guest");
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe("exportStore", () => {
  it("includes every saved document", async () => {
    const { store, unmount } = renderPage(<p>Empty</p>);
    await store.set("advisorThreads", [THREAD]);
    const data = await exportStore(store);
    expect(data.app).toBe("BetterSSB");
    expect(data.documents).toEqual({ advisorThreads: [THREAD] });
    unmount();
  });

  it("turns single-key shortcuts off", async () => {
    const user = userEvent.setup();
    const { store } = renderPage(<SettingsPage />);
    const toggle = await screen.findByRole("switch", {
      name: "Single-key shortcuts",
    });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    await user.click(toggle);
    await waitFor(async () =>
      expect((await store.get("settings"))?.keyboardShortcuts).toBe(false),
    );
  });

  it("turns the Banner page overlay off", async () => {
    const user = userEvent.setup();
    const { store } = renderPage(<SettingsPage />);
    const toggle = await screen.findByRole("switch", {
      name: "Ratings, seats and your plan",
    });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    await user.click(toggle);
    await waitFor(async () =>
      expect((await store.get("settings"))?.bannerOverlay).toBe(false),
    );
  });
});
