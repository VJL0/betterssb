import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { axeViolations } from "@workspace/ui/test/axe";
import { mockApi } from "@/test/api";
import { classSection, meetingTime } from "@/test/class-section";
import { renderPage } from "@/test/render";
import { SearchPage } from "./search-page";

const SEARCH_TIMEOUT = { timeout: 3_000 };

const SEARCH = "GET /api/classes/search";
let api: ReturnType<typeof mockApi>;

beforeEach(() => {
  api = mockApi({
    "GET /api/classes/terms": [{ code: "202703", description: "2027 Spring" }],
    "GET /api/classes/subjects": [
      { code: "CIS", description: "Computer & Information Science" },
    ],
    "GET /api/classes/attributes": [],
    [SEARCH]: {
      totalCount: 2,
      fetchedAt: "2026-10-17T12:00:00.000Z",
      sections: [
        classSection(),
        classSection({
          courseReferenceNumber: "41208",
          sequenceNumber: "002",
          meetings: [meetingTime("MWF", "1100", "1150")],
        }),
      ],
    },
  });
});

/** Query strings of the class searches sent so far. */
function searchesSent(): string[] {
  return api.mock.calls
    .map(([input]) => new URL((input as Request).url))
    .filter((url) => url.pathname === "/api/classes/search")
    .map((url) => url.search);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("SearchPage", () => {
  it("offers example searches before anything is typed", async () => {
    renderPage(<SearchPage />);
    expect(await screen.findByText("Search Spring 2027 sections")).toBeTruthy();
    expect(screen.getByRole("button", { name: "CIS 2168" })).toBeTruthy();
  });

  it("searches a course code and adds a section to the plan", async () => {
    const user = userEvent.setup();
    const { store } = renderPage(<SearchPage />);
    const input = await screen.findByRole("searchbox", {
      name: "Search courses",
    });
    await waitFor(() => expect(input.hasAttribute("disabled")).toBe(false));
    await user.type(input, "CIS 2168");

    const add = await screen.findAllByRole(
      "button",
      { name: "Add CIS 2168 · 002 (CRN 41208) to your Spring 2027 plan" },
      SEARCH_TIMEOUT,
    );
    expect(searchesSent()).toEqual([
      "?term=202703&subject=CIS&courseNumber=2168&limit=50&offset=0",
    ]);
    await user.click(add[0]!);
    await waitFor(async () =>
      expect(
        (await store.get("plan:202703"))?.sections.map((s) => s.crn),
      ).toEqual(["41208"]),
    );
  });

  it("has no accessibility violations with results", async () => {
    const user = userEvent.setup();
    const { container } = renderPage(<SearchPage />);
    const input = await screen.findByRole("searchbox", {
      name: "Search courses",
    });
    await waitFor(() => expect(input.hasAttribute("disabled")).toBe(false));
    await user.type(input, "CIS 2168");
    await screen.findAllByText("Data Structures", undefined, SEARCH_TIMEOUT);
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe("SearchPage links", () => {
  it("searches for ?q= on arrival", async () => {
    renderPage(<SearchPage />, { route: "/search?q=CIS%202168" });
    expect(
      await screen.findAllByText("Data Structures", undefined, SEARCH_TIMEOUT),
    ).not.toHaveLength(0);
    expect(searchesSent()).toHaveLength(1);
  });
});
