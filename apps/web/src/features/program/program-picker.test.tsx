import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  API,
  PROGRAM_URL,
  http,
  problemResponse,
  server,
} from "@workspace/api-client/testing";
import {
  startTermOptions,
  suggestedBulletinYear,
} from "@workspace/shared/lib/bulletin";
import { DEFAULT_SETTINGS } from "@workspace/shared/lib/store";
import { axeViolations } from "@workspace/ui/test/axe";
import { renderPage } from "@/test/render";
import { ProgramPicker } from "./program-picker";

const START_TERM = startTermOptions(new Date()).find((t) =>
  t.name.startsWith("Fall"),
)!;
const BULLETIN_YEAR = suggestedBulletinYear(START_TERM.code)!;

async function renderStartedIn(startTerm: string | null) {
  const view = renderPage(<ProgramPicker />);
  await view.store.set("settings", {
    ...DEFAULT_SETTINGS,
    startTerm,
    updatedAt: new Date().toISOString(),
  });
  return view;
}

describe("ProgramPicker", () => {
  it("waits for a start term before listing programs", async () => {
    await renderStartedIn(null);
    expect(
      await screen.findByText(/first term picks which year's Bulletin/),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("combobox", { name: "What's your academic program?" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });

  it("suggests a Bulletin year from the start term", async () => {
    const user = userEvent.setup();
    const { store } = await renderStartedIn(null);
    await user.click(
      await screen.findByRole("combobox", {
        name: "When did you start at Temple?",
      }),
    );
    await user.click(
      await screen.findByRole("option", { name: START_TERM.name }),
    );

    expect(
      await screen.findByText(`Suggests the ${BULLETIN_YEAR} Bulletin`, {
        exact: false,
      }),
    ).toBeTruthy();
    await waitFor(async () =>
      expect((await store.get("settings"))?.startTerm).toBe(START_TERM.code),
    );
    expect(
      await screen.findByRole("link", { name: `${BULLETIN_YEAR} Bulletin` }),
    ).toHaveProperty(
      "href",
      `https://bulletin.temple.edu/archives/${BULLETIN_YEAR}/academic-programs/`,
    );
  });

  it("saves the program and shows its requirements with the source", async () => {
    const user = userEvent.setup();
    const { store, container } = await renderStartedIn(START_TERM.code);
    const program = await screen.findByRole("combobox", {
      name: "What's your academic program?",
    });
    await waitFor(() => expect(program.hasAttribute("disabled")).toBe(false));

    await user.type(program, "science bs");
    await user.click(
      await screen.findByRole("option", { name: /Computer Science BS/ }),
    );

    await waitFor(async () =>
      expect((await store.get("settings"))?.program).toEqual({
        name: "Computer Science",
        degree: "BS",
        url: PROGRAM_URL,
        bulletinYear: BULLETIN_YEAR,
      }),
    );
    expect((await store.get("settings"))?.major).toBe("Computer Science BS");
    expect(
      await screen.findByRole("heading", { name: "Computer Science BS" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "View on the Bulletin" }),
    ).toHaveProperty("href", PROGRAM_URL);
    expect(await axeViolations(container)).toEqual([]);
  });

  it("explains when a year's Bulletin isn't online", async () => {
    const missing = `The ${BULLETIN_YEAR} Bulletin isn't on bulletin.temple.edu.`;
    server.use(
      http.get(`${API}/degree/programs`, () => problemResponse(404, missing)),
    );
    await renderStartedIn(START_TERM.code);
    expect(await screen.findByText("Couldn't load programs")).toBeTruthy();
    expect(screen.getByText(missing, { exact: false })).toBeTruthy();
  });
});
