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

type User = ReturnType<typeof userEvent.setup>;

/** Opens the full filters panel and returns queries scoped to it. */
async function openFilters(user: User) {
  await user.click(await screen.findByRole("button", { name: /^Filters/ }));
  return within(await screen.findByRole("dialog", { name: "Filters" }));
}

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
    const filters = await openFilters(user);
    for (const name of [
      "Minimum instructor rating",
      "Maximum instructor difficulty",
    ]) {
      expect(
        filters.getByRole("slider", { name }).hasAttribute("disabled"),
      ).toBe(true);
    }
  });

  it("sorts sections by most open seats", async () => {
    server.use(
      http.get(`${API}/classes/search`, () =>
        HttpResponse.json({
          totalCount: 2,
          fetchedAt: FETCHED_AT,
          sections: [
            classSection({ seatsAvailable: 2 }),
            classSection({
              courseReferenceNumber: "41208",
              sequenceNumber: "002",
              seatsAvailable: 20,
            }),
          ],
        }),
      ),
    );
    const user = userEvent.setup();
    renderPage(<SearchPage />);
    const input = await screen.findByRole("searchbox", {
      name: "Search courses",
    });
    await waitFor(() => expect(input.hasAttribute("disabled")).toBe(false));
    await user.type(input, "CIS 2168");
    const firstSection = async () =>
      (
        await screen.findAllByRole(
          "button",
          { name: /^Add CIS 2168/ },
          SEARCH_TIMEOUT,
        )
      )[0]!.getAttribute("aria-label");
    expect(await firstSection()).toContain("· 001");

    await user.click(screen.getByRole("combobox", { name: "Sort by" }));
    await user.click(
      await screen.findByRole("option", { name: "Most open seats" }),
    );

    expect(await firstSection()).toContain("· 002");
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

describe("SearchPage filters", () => {
  /** The params of the last search sent, once one matching `done` is. */
  async function lastSearch(
    searches: Request[],
    done: (query: URLSearchParams) => boolean,
  ): Promise<URLSearchParams> {
    let query = new URLSearchParams();
    await waitFor(() => {
      query = new URL(searches.at(-1)!.url).searchParams;
      expect(done(query)).toBe(true);
    }, SEARCH_TIMEOUT);
    return query;
  }

  it("searches a GenEd area with nothing typed", async () => {
    server.use(
      http.get(`${API}/classes/attributes`, () =>
        HttpResponse.json([{ code: "GA", description: "GenEd Arts" }]),
      ),
    );
    const searches = recordRequests(SEARCH);
    const user = userEvent.setup();
    renderPage(<SearchPage />);
    const filters = await openFilters(user);

    await user.click(await filters.findByRole("checkbox", { name: "Arts" }));

    const query = await lastSearch(searches, (q) => q.has("attribute"));
    expect(query.getAll("attribute")).toEqual(["GA"]);
    expect(query.has("keyword")).toBe(false);
    expect(query.has("subject")).toBe(false);
  });

  it("sends a format's instructional methods with the search", async () => {
    const searches = recordRequests(SEARCH);
    const user = userEvent.setup();
    renderPage(<SearchPage />);
    const input = await screen.findByRole("searchbox", {
      name: "Search courses",
    });
    await waitFor(() => expect(input.hasAttribute("disabled")).toBe(false));
    await user.type(input, "CIS 2168");
    const filters = await openFilters(user);

    await user.click(filters.getByRole("button", { name: "Async online" }));

    const query = await lastSearch(searches, (q) =>
      q.has("instructionalMethod"),
    );
    expect(query.getAll("instructionalMethod")).toEqual(["OLL"]);
    expect(query.get("subject")).toBe("CIS");
  });

  it("turns a quick filter on with one tap and counts it", async () => {
    const searches = recordRequests(SEARCH);
    const user = userEvent.setup();
    renderPage(<SearchPage />);
    const input = await screen.findByRole("searchbox", {
      name: "Search courses",
    });
    await waitFor(() => expect(input.hasAttribute("disabled")).toBe(false));
    await user.type(input, "CIS 2168");
    const quick = within(screen.getByRole("group", { name: "Quick filters" }));

    await user.click(quick.getByRole("button", { name: "Online" }));

    const query = await lastSearch(searches, (q) =>
      q.has("instructionalMethod"),
    );
    expect(query.getAll("instructionalMethod")).toEqual([
      "VIRT",
      "VRT2",
      "VIDEO",
      "OLL",
    ]);
    expect(
      quick
        .getByRole("button", { name: "Online" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.getByRole("button", { name: "Filters (1)" })).toBeTruthy();
  });

  it("shows each applied filter as a chip that removes it", async () => {
    server.use(
      http.get(`${API}/classes/campuses`, () =>
        HttpResponse.json([{ code: "MN", description: "Main" }]),
      ),
    );
    const searches = recordRequests(SEARCH);
    const user = userEvent.setup();
    renderPage(<SearchPage />);
    const input = await screen.findByRole("searchbox", {
      name: "Search courses",
    });
    await waitFor(() => expect(input.hasAttribute("disabled")).toBe(false));
    await user.type(input, "CIS 2168");
    const filters = await openFilters(user);
    await user.click(filters.getByRole("combobox", { name: "Campus" }));
    await user.click(await screen.findByRole("option", { name: "Main" }));
    await user.keyboard("{Escape}");
    await lastSearch(searches, (q) => q.get("campus") === "MN");

    // Desktop's row and the phone row beside the quick filters both list it.
    const chips = await screen.findAllByRole("button", {
      name: "Remove filter: Main",
    });
    await user.click(chips[0]!);

    await lastSearch(searches, (q) => !q.has("campus"));
    expect(
      screen.queryAllByRole("button", { name: "Remove filter: Main" }),
    ).toEqual([]);
  });

  it("offers to reset when Banner's filters leave nothing", async () => {
    const user = userEvent.setup();
    renderPage(<SearchPage />);
    const filters = await openFilters(user);

    await user.type(
      filters.getByRole("searchbox", { name: "Instructor name" }),
      "Nobody",
    );
    await user.keyboard("{Escape}");

    expect(
      await screen.findByText(
        "Nothing in Spring 2027 matches",
        undefined,
        SEARCH_TIMEOUT,
      ),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Reset filters" }));
    expect(screen.getByRole("button", { name: "Filters" })).toBeTruthy();
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
