import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { axeViolations } from "@workspace/ui/test/axe";
import { API, http, HttpResponse, server } from "@workspace/api-client/testing";
import { testPathname } from "@/test/navigation";
import { renderPage } from "@/test/render";
import { GetStartedPage } from "./get-started-page";

beforeEach(() => {
  server.use(
    http.get(`${API}/classes/terms`, () =>
      HttpResponse.json([
        { code: "202703", description: "2027 Spring" },
        { code: "202636", description: "2026 Fall" },
        { code: "202536", description: "2025 Fall (View Only)" },
      ]),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderStart(route = "/start") {
  return renderPage(<GetStartedPage />, { route });
}

describe("GetStartedPage", () => {
  it("asks for a term before continuing", async () => {
    const user = userEvent.setup();
    renderStart();
    await screen.findByRole("radiogroup", { name: "Term" });
    expect(
      within(screen.getByRole("list", { name: "Setup steps" }))
        .getAllByRole("listitem")
        .map((step) => step.textContent),
    ).toEqual(["Term", "Banner · optional"]);
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("Choose a term to continue.")).toBeTruthy();
  });

  it("offers plannable terms only", async () => {
    renderStart();
    const terms = await screen.findByRole("radiogroup", { name: "Term" });
    expect(within(terms).getAllByRole("radio")).toHaveLength(2);
    expect(
      within(terms).getByRole("radio", { name: "Spring 2027" }),
    ).toBeTruthy();
    expect(
      within(terms).getByRole("radio", { name: "Fall 2026" }),
    ).toBeTruthy();
    expect(within(terms).queryByRole("radio", { name: /2025/ })).toBeNull();
  });

  it("saves the term and major and lets Banner be skipped", async () => {
    const user = userEvent.setup();
    const { store } = renderStart();
    await user.click(await screen.findByRole("radio", { name: "Spring 2027" }));
    await user.type(
      screen.getByRole("textbox", { name: /Major/ }),
      "Computer Science",
    );
    await user.click(screen.getByRole("button", { name: "Continue" }));

    await user.click(
      await screen.findByRole("button", { name: "Skip for now" }),
    );
    await waitFor(() => expect(testPathname()).not.toBe("/start"));
    const settings = await store.get("settings");
    expect(settings).toMatchObject({
      term: "202703",
      major: "Computer Science",
    });
  });

  it("has no axe violations on each step", async () => {
    for (const route of ["/start", "/start?step=banner"]) {
      const { container, unmount } = renderStart(route);
      await screen.findByRole("heading", { level: 1 });
      expect(await axeViolations(container)).toEqual([]);
      unmount();
    }
  });
});
