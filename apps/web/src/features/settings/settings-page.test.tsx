import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { axeViolations } from "@workspace/ui/test/axe";
import { renderPage } from "@/test/render";
import { exportStore } from "./export-data";
import { SettingsPage } from "./settings-page";

afterEach(() => {
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.betterssbExtension;
});

/** The marker the extension sets on the page when it's installed. */
function installExtension() {
  document.documentElement.dataset.betterssbExtension = "9.9.9";
}

const THREAD = {
  id: "t1",
  title: "Electives",
  messages: [{ role: "user" as const, content: "Which electives?" }],
  updatedAt: "2026-10-17T00:00:00.000Z",
};

describe("SettingsPage", () => {
  it("says where data is saved and that Banner needs the extension", async () => {
    renderPage(<SettingsPage />);
    expect(
      await screen.findByText(
        "Only saved in this browser, not your Temple account.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText("Needed for DARS, auto-register and Banner ratings."),
    ).toBeTruthy();
    expect(
      screen.queryByRole("switch", { name: "Show ratings on Banner" }),
    ).toBeNull();
  });

  it("deletes advisor chats only after confirming", async () => {
    const user = userEvent.setup();
    const { store } = renderPage(<SettingsPage />);
    await store.set("advisorThreads", [THREAD]);
    const clear = await screen.findByRole("button", {
      name: "Delete advisor chats",
    });
    await waitFor(() => expect(clear.hasAttribute("disabled")).toBe(false));

    await user.click(clear);
    await user.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(await store.get("advisorThreads")).not.toBeNull();

    await user.click(clear);
    await user.click(
      await screen.findByRole("button", { name: "Delete chats" }),
    );
    await waitFor(async () =>
      expect(await store.get("advisorThreads")).toBeNull(),
    );
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });

  it("deletes everything in the browser", async () => {
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
      await screen.findByRole("button", { name: "Delete everything" }),
    );
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(async () => expect(await store.keys()).toEqual([]));
  });

  it("has no axe violations", async () => {
    const { container } = renderPage(<SettingsPage />);
    await screen.findByText(
      "Only saved in this browser, not your Temple account.",
    );
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
      name: "Keyboard shortcuts",
    });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    await user.click(toggle);
    await waitFor(async () =>
      expect((await store.get("settings"))?.keyboardShortcuts).toBe(false),
    );
  });

  it("turns the Banner page overlay off", async () => {
    installExtension();
    const user = userEvent.setup();
    const { store } = renderPage(<SettingsPage />);
    const toggle = await screen.findByRole("switch", {
      name: "Show ratings on Banner",
    });
    expect(
      screen.queryByText("Needed for DARS, auto-register and Banner ratings."),
    ).toBeNull();
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    await user.click(toggle);
    await waitFor(async () =>
      expect((await store.get("settings"))?.bannerOverlay).toBe(false),
    );
  });
});
