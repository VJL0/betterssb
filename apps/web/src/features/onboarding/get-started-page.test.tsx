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
    http.get(`${API}/rmp/schools`, () =>
      HttpResponse.json([
        { id: "U2Nob29sLTk5OQ==", legacyId: 999, name: "Temple University" },
      ]),
    ),
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
  it("names the school field and asks for a school before continuing", async () => {
    const user = userEvent.setup();
    renderStart();
    expect(screen.getByRole("combobox", { name: "School" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("Choose your school to continue.")).toBeTruthy();
    expect(
      screen
        .getByRole("combobox", { name: "School" })
        .getAttribute("aria-invalid"),
    ).toBe("true");
  });

  it("saves the school, then offers plannable terms only", async () => {
    const user = userEvent.setup();
    const { store } = renderStart();
    await user.type(screen.getByRole("combobox", { name: "School" }), "Temple");
    await user.click(
      await screen.findByRole("option", { name: "Temple University" }),
    );
    await user.click(screen.getByRole("button", { name: "Continue" }));

    const terms = await screen.findByRole("radiogroup", { name: "Term" });
    expect(within(terms).getAllByRole("radio")).toHaveLength(2);
    expect(
      within(terms).getByRole("radio", { name: "Spring 2027" }),
    ).toBeTruthy();
    expect(
      within(terms).getByRole("radio", { name: "Fall 2026" }),
    ).toBeTruthy();
    expect(within(terms).queryByRole("radio", { name: /2025/ })).toBeNull();
    expect((await store.get("settings"))?.school?.name).toBe(
      "Temple University",
    );
  });

  it("saves the term and major and lets Banner be skipped", async () => {
    const user = userEvent.setup();
    const { store } = renderStart("/start?step=term");
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
    for (const route of ["/start", "/start?step=term", "/start?step=banner"]) {
      const { container, unmount } = renderStart(route);
      await screen.findByRole("heading", { level: 1 });
      expect(await axeViolations(container)).toEqual([]);
      unmount();
    }
  });
});
