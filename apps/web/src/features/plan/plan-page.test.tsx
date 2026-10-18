import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addSection,
  emptyPlan,
  plannedSectionFrom,
} from "@workspace/shared/lib/plan";
import { axeViolations } from "@workspace/ui/test/axe";
import { classSection } from "@/test/class-section";
import { mockApi } from "@/test/api";
import { renderPage } from "@/test/render";
import { PlanPage } from "./plan-page";
import type { Audit } from "@workspace/api-client";

const NOW = "2026-10-17T12:00:00.000Z";

beforeEach(() => {
  mockApi({
    "GET /api/classes/terms": [{ code: "202703", description: "2027 Spring" }],
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const audit: Audit = {
  studentName: "",
  programTitle: "Computer Science BS",
  programCode: "CS",
  catalogYear: "2024",
  preparedOn: "10/12/2026",
  complete: false,
  requirements: [
    {
      code: "TOTAL",
      category: "Total_Hours",
      title: "Total hours",
      status: "incomplete",
      notes: [],
      earned: { credits: 52, courses: null, gpa: null },
      inProgress: { credits: 15, courses: null, gpa: null },
      needs: { credits: 57, courses: null, gpa: null },
      subrequirements: [],
    },
    {
      code: "WI",
      category: "MAJOR",
      title: "Writing intensive",
      status: "incomplete",
      notes: [],
      earned: null,
      inProgress: null,
      needs: { credits: 4, courses: 1, gpa: null },
      subrequirements: [
        {
          number: "1",
          title: "",
          status: "incomplete",
          earned: null,
          inProgress: null,
          needs: null,
          courses: [],
          selectFrom: ["CIS 4398"],
        },
      ],
    },
  ],
};

async function renderPlanner({ withAudit = true } = {}) {
  const view = renderPage(<PlanPage />);
  await view.store.set(
    "plan:202703",
    addSection(
      emptyPlan("202703", "Spring 2027"),
      plannedSectionFrom(classSection(), NOW),
      NOW,
    ),
  );
  if (withAudit) await view.store.set("audit", { audit, storedAt: NOW });
  return view;
}

describe("PlanPage", () => {
  it("points to the degree audit until one is saved", async () => {
    await renderPlanner({ withAudit: false });
    expect(
      await screen.findByText("See your progress toward your degree"),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Open degree audit" })
        .getAttribute("href"),
    ).toBe("/audit");
    expect(screen.queryByRole("heading", { name: "Still needed" })).toBeNull();
  });

  it("counts audit and planned credits toward the degree", async () => {
    await renderPlanner();
    expect(await screen.findByText("Toward 124 credits")).toBeTruthy();
    expect(
      screen.getByRole("img", {
        name: "52 completed, 15 in progress, 4 planned of 124 credits",
      }),
    ).toBeTruthy();
    expect(screen.getByText("53 more credits to plan")).toBeTruthy();
    const spring = screen.getByRole("article", { name: "Spring 2027" });
    expect(within(spring).getByText("CIS 2168")).toBeTruthy();
    expect(within(spring).getByText("Under 12 cr is part-time")).toBeTruthy();
  });

  it("adds a still-needed requirement to the chosen term", async () => {
    const user = userEvent.setup();
    const { store } = await renderPlanner();
    await user.click(
      await screen.findByRole("button", {
        name: "Add Writing intensive to Spring 2027",
      }),
    );
    await waitFor(async () => {
      const plan = await store.get("plan:202703");
      expect(plan?.courses).toEqual([
        expect.objectContaining({
          code: "CIS 4398",
          requirement: "WI",
          credits: 4,
        }),
      ]);
    });
    expect(
      await screen.findByText("Every requirement has a term."),
    ).toBeTruthy();
  });

  it("adds an upcoming term from the menu", async () => {
    const user = userEvent.setup();
    const { store } = await renderPlanner();
    await user.click(await screen.findByRole("button", { name: "Add term" }));
    await user.click(
      await screen.findByRole("menuitem", { name: "Fall 2027" }),
    );
    await waitFor(async () =>
      expect(await store.get("plan:202736")).not.toBeNull(),
    );
    expect(
      await screen.findByRole("article", { name: "Fall 2027" }),
    ).toBeTruthy();
  });

  it("has no accessibility violations", async () => {
    const { container } = await renderPlanner();
    await screen.findByText("Toward 124 credits");
    expect(await axeViolations(container)).toEqual([]);
  });
});
