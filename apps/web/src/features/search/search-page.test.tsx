import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { axeViolations } from "@workspace/ui/test/axe";
import {
  API,
  FETCHED_AT,
  http,
  HttpResponse,
  problemResponse,
  recordRequests,
  server,
} from "@workspace/api-client/testing";
import {
  classSection,
  meetingTime,
} from "@workspace/shared/testing/class-section";
import { renderPage } from "@/test/render";
import { SearchPage } from "./search-page";

const SEARCH_TIMEOUT = { timeout: 3_000 };

const SEARCH = "GET /api/classes/search";

/** True when the query is the one the page should send for "CIS 2168". */
function isCis2168(query: URLSearchParams): boolean {
  return (
    query.get("term") === "202703" &&
    query.get("subject") === "CIS" &&
    query.get("courseNumber") === "2168"
  );
}

// Only a correctly built search finds CIS 2168, so the results on screen
// show the page sent the right query.
beforeEach(() => {
  server.use(
    http.get(`${API}/classes/search`, ({ request }) => {
      if (!isCis2168(new URL(request.url).searchParams)) {
        return HttpResponse.json({
          totalCount: 0,
          fetchedAt: FETCHED_AT,
          sections: [],
        });
      }
      return HttpResponse.json({
        totalCount: 2,
        fetchedAt: FETCHED_AT,
        sections: [
          classSection(),
          classSection({
            courseReferenceNumber: "41208",
            sequenceNumber: "002",
            meetings: [meetingTime("MWF", "1100", "1150")],
          }),
        ],
      });
    }),
  );
});

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
    await user.click(add[0]!);
    await waitFor(async () =>
      expect(
        (await store.get("plan:202703"))?.sections.map((s) => s.crn),
      ).toEqual(["41208"]),
    );
  });

  it("says ratings are loading while the API's first sync runs", async () => {
    server.use(http.get(`${API}/rmp/search`, () => problemResponse(503)));
    const user = userEvent.setup();
    renderPage(<SearchPage />);
    const input = await screen.findByRole("searchbox", {
      name: "Search courses",
    });
    await waitFor(() => expect(input.hasAttribute("disabled")).toBe(false));
    await user.type(input, "CIS 2168");

    await waitFor(
      () =>
        expect(
          screen.getAllByRole("status").map((el) => el.textContent),
        ).toContain(
          "Loading instructor ratings. The first load takes about a minute.",
        ),
      SEARCH_TIMEOUT,
    );
    expect(
      (await screen.findAllByText("Rating loading", { exact: false })).length,
    ).toBeGreaterThan(0);
    // Filtering by rating can't work until there are ratings.
    for (const button of within(
      screen.getAllByRole("group", { name: "Instructor rating" })[0]!,
    ).getAllByRole("button")) {
      expect(button.hasAttribute("disabled")).toBe(true);
    }
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
    // Nothing on screen shows a duplicate search, so count the requests.
    const searches = recordRequests(SEARCH);
    renderPage(<SearchPage />, { route: "/search?q=CIS%202168" });
    expect(
      await screen.findAllByText("Data Structures", undefined, SEARCH_TIMEOUT),
    ).not.toHaveLength(0);
    expect(searches).toHaveLength(1);
  });
});
