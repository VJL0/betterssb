import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { axeViolations } from "@workspace/ui/test/axe";
import { searchClasses } from "@/lib/api/classes";
import { classSection, meetingTime } from "@/test/class-section";
import { renderPage } from "@/test/render";
import { SearchPage } from "./search-page";

const SEARCH_TIMEOUT = { timeout: 3_000 };

vi.mock("@/lib/api/classes", () => ({
  fetchTerms: vi.fn(async () => [
    { code: "202703", description: "2027 Spring" },
  ]),
  fetchSubjects: vi.fn(async () => [
    { code: "CIS", description: "Computer & Information Science" },
  ]),
  fetchAttributes: vi.fn(async () => []),
  searchClasses: vi.fn(async () => ({
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
  })),
}));

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
    expect(searchClasses).toHaveBeenCalledWith(
      expect.objectContaining({
        term: "202703",
        subject: "CIS",
        courseNumber: "2168",
      }),
      expect.anything(),
    );
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
