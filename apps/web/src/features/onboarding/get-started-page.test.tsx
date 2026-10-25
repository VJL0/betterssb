import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { axeViolations } from "@workspace/ui/test/axe";
import {
  API,
  PROGRAM_URL,
  http,
  HttpResponse,
  server,
} from "@workspace/api-client/testing";
import { startTermOptions } from "@workspace/shared/lib/bulletin";
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
    ).toEqual(["Term", "Program", "Banner · optional"]);
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

  it("asks for a start term and program before continuing", async () => {
    const user = userEvent.setup();
    renderStart("/start?step=program");
    await user.click(await screen.findByRole("button", { name: "Continue" }));
    expect(
      screen.getByText("Choose your start term and program to continue."),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Where are you in your degree?" }),
    ).toBeTruthy();
  });

  it("saves the term, start term and program, and lets Banner be skipped", async () => {
    const user = userEvent.setup();
    const startTerm = startTermOptions(new Date()).find((t) =>
      t.name.startsWith("Fall"),
    )!;
    const { store } = renderStart();
    await user.click(await screen.findByRole("radio", { name: "Spring 2027" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));

    await user.click(
      await screen.findByRole("combobox", {
        name: "When did you start at Temple?",
      }),
    );
    await user.click(
      await screen.findByRole("option", { name: startTerm.name }),
    );
    const program = screen.getByRole("combobox", {
      name: "What's your academic program?",
    });
    await waitFor(() => expect(program.hasAttribute("disabled")).toBe(false));
    await user.type(program, "science bs");
    await user.click(
      await screen.findByRole("option", { name: /Computer Science BS/ }),
    );
    // Onboarding leaves the requirements to the planner and audit.
    expect(
      screen.queryByRole("link", { name: "View on the Bulletin" }),
    ).toBeNull();
    await user.click(screen.getByRole("button", { name: "Continue" }));

    await user.click(
      await screen.findByRole("button", { name: "Skip for now" }),
    );
    await waitFor(() => expect(testPathname()).not.toBe("/start"));
    expect(await store.get("settings")).toMatchObject({
      term: "202703",
      startTerm: startTerm.code,
      major: "Computer Science BS",
      program: { url: PROGRAM_URL },
    });
  });

  it("has no axe violations on each step", async () => {
    for (const route of [
      "/start",
      "/start?step=program",
      "/start?step=banner",
    ]) {
      const { container, unmount } = renderStart(route);
      await screen.findByRole("heading", { level: 1 });
      expect(await axeViolations(container)).toEqual([]);
      unmount();
    }
  });
});
