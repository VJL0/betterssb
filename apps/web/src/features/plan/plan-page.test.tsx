import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addSection,
  emptyPlan,
  plannedSectionFrom,
} from "@workspace/shared/lib/plan";
import { axeViolations } from "@workspace/ui/test/axe";
import { classSection } from "@workspace/shared/testing/class-section";
import { renderPage } from "@/test/render";
import { PlanPage } from "./plan-page";
import type { Audit } from "@workspace/api-client";

const NOW = "2026-10-17T12:00:00.000Z";

/** jsdom has no DataTransfer; this keeps what a drag sets for its drop to read. */
function dataTransfer() {
  const data = new Map<string, string>();
  return {
    effectAllowed: "all",
    dropEffect: "none",
    setData: (type: string, value: string) => data.set(type, value),
    getData: (type: string) => data.get(type) ?? "",
    get types() {
      return [...data.keys()];
    },
  };
}

function drag(from: Element, to: Element) {
  const transfer = dataTransfer();
  fireEvent.dragStart(from, { dataTransfer: transfer });
  fireEvent.dragOver(to, { dataTransfer: transfer });
  fireEvent.drop(to, { dataTransfer: transfer });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const audit: Audit = {
  studentName: "",
  programTitle: "Computer Science BS",
  programCode: "CS",
  catalogYear: "2024",
  preparedOn: "10/12/2026",
  graduationDate: "",
  analysisComplete: true,
  degreeTotals: null,
  categoryTotals: [],
  complete: false,
  requirements: [
    {
      code: "TOTAL",
      category: "Total_Hours",
      title: "Total hours",
      status: "incomplete",
      notes: [],
      earned: {
        credits: 52,
        courses: null,
        sets: null,
        subrequirements: null,
        gpa: null,
      },
      inProgress: {
        credits: 15,
        courses: null,
        sets: null,
        subrequirements: null,
        gpa: null,
      },
      needs: {
        credits: 57,
        courses: null,
        sets: null,
        subrequirements: null,
        gpa: null,
      },
      requiredCredits: null,
      requiredGpa: null,
      requiredSubrequirements: null,
      requiredCount: null,
      maxCredits: null,
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
      needs: {
        credits: 4,
        courses: 1,
        sets: null,
        subrequirements: null,
        gpa: null,
      },
      requiredCredits: null,
      requiredGpa: null,
      requiredSubrequirements: null,
      requiredCount: null,
      maxCredits: null,
      subrequirements: [
        {
          number: "1",
          title: "",
          notes: [],
          requiredCredits: null,
          code: "",
          aliases: [],
          required: false,
          requiredCount: null,
          requiredGpa: null,
          maxCredits: null,
          choices: [],
          notFrom: [],
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

  it("adds any term from the dialog", async () => {
    const user = userEvent.setup();
    const { store } = await renderPlanner();
    const fall = `Fall ${new Date().getFullYear()}`;
    await user.click(await screen.findByRole("button", { name: "Add term" }));
    await user.click(
      await screen.findByRole("menuitem", { name: "Another term…" }),
    );
    await user.click(
      await screen.findByRole("button", { name: `Add ${fall}` }),
    );
    expect(await screen.findByRole("article", { name: fall })).toBeTruthy();
    const keys = await store.keys();
    expect(keys).toContain(`plan:${new Date().getFullYear()}36`);
  });

  it("moves a term to another one, its sections becoming planned courses", async () => {
    const user = userEvent.setup();
    const { store } = await renderPlanner();
    await user.click(
      await screen.findByRole("button", { name: "Spring 2027 options" }),
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "Change term" }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog)
        .getByRole("button", { name: "Move to Spring 2027" })
        .hasAttribute("disabled"),
    ).toBe(true);
    await user.click(within(dialog).getByRole("combobox", { name: "Year" }));
    await user.click(await screen.findByRole("option", { name: "2028" }));
    await user.click(
      within(dialog).getByRole("button", { name: "Move to Spring 2028" }),
    );
    await waitFor(async () => {
      expect(await store.get("plan:202703")).toBeNull();
      const moved = await store.get("plan:202803");
      expect(moved?.sections).toEqual([]);
      expect(moved?.courses).toEqual([
        expect.objectContaining({ code: "CIS 2168" }),
      ]);
    });
  });

  it("removes a term, and only clears the current one", async () => {
    const user = userEvent.setup();
    const { store } = await renderPlanner();
    await store.set("plan:202736", emptyPlan("202736", "Fall 2027"));
    await user.click(
      await screen.findByRole("button", { name: "Fall 2027 options" }),
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "Remove term" }),
    );
    await waitFor(async () =>
      expect(await store.get("plan:202736")).toBeNull(),
    );
    expect(screen.queryByRole("article", { name: "Fall 2027" })).toBeNull();

    // Spring 2027 is the term the app is on, so it stays on screen.
    await user.click(
      await screen.findByRole("button", { name: "Spring 2027 options" }),
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "Clear term" }),
    );
    await waitFor(async () =>
      expect(await store.get("plan:202703")).toBeNull(),
    );
    expect(screen.getByRole("article", { name: "Spring 2027" })).toBeTruthy();
  });

  it("moves a course to another term by dragging it", async () => {
    const { store } = await renderPlanner();
    await store.set("plan:202736", emptyPlan("202736", "Fall 2027"));
    const spring = await screen.findByRole("article", { name: "Spring 2027" });
    const fall = await screen.findByRole("article", { name: "Fall 2027" });
    drag(within(spring).getByText("CIS 2168").closest("li")!, fall);
    await waitFor(async () => {
      expect((await store.get("plan:202703"))?.sections).toEqual([]);
      expect((await store.get("plan:202736"))?.courses).toEqual([
        expect.objectContaining({ code: "CIS 2168" }),
      ]);
    });
  });

  it("drags a course from the Bulletin catalog onto a term", async () => {
    const user = userEvent.setup();
    const { store } = await renderPlanner();
    await user.click(await screen.findByRole("tab", { name: "All courses" }));
    // The catalog opens on the subject most of the plan is in.
    const list = await screen.findByRole("list", { name: "CIS courses" });
    expect(within(list).queryByText("CIS 5015")).toBeNull();
    drag(
      within(list).getByText("CIS 3296").closest("li")!,
      screen.getByRole("article", { name: "Spring 2027" }),
    );
    await waitFor(async () =>
      expect((await store.get("plan:202703"))?.courses).toEqual([
        expect.objectContaining({
          code: "CIS 3296",
          title: "Software Design",
          credits: 4,
        }),
      ]),
    );
    expect(await within(list).findByText("In Spring 2027")).toBeTruthy();
  });

  it("adds a catalog course to the chosen term with its button", async () => {
    const user = userEvent.setup();
    const { store } = await renderPlanner();
    await user.click(await screen.findByRole("tab", { name: "All courses" }));
    await user.click(
      await screen.findByRole("button", { name: "Show 1 graduate course" }),
    );
    await user.click(
      await screen.findByRole("button", {
        name: "Add CIS 5015 to Spring 2027",
      }),
    );
    await waitFor(async () =>
      expect((await store.get("plan:202703"))?.courses).toEqual([
        expect.objectContaining({ code: "CIS 5015", credits: 3 }),
      ]),
    );
  });

  it("optimizes the plan with the student's priorities", async () => {
    const user = userEvent.setup();
    const { store } = await renderPlanner();
    await user.click(
      await screen.findByRole("button", { name: "Optimize plan" }),
    );
    const sheet = await screen.findByRole("dialog");
    await user.click(
      within(
        within(sheet).getByRole("group", {
          name: "Priority for Writing intensive",
        }),
      ).getByRole("button", { name: "High" }),
    );
    await waitFor(async () =>
      expect((await store.get("planPreferences"))?.priorities).toEqual({
        WI: "high",
      }),
    );
    const preview = within(sheet).getByRole("article", {
      name: "Spring 2027 preview",
    });
    expect(within(preview).getByText("CIS 4398")).toBeTruthy();
    await user.click(
      await within(sheet).findByRole("button", { name: "Place 1 course" }),
    );
    await waitFor(async () =>
      expect((await store.get("plan:202703"))?.courses).toEqual([
        expect.objectContaining({ code: "CIS 4398", requirement: "WI" }),
      ]),
    );
  });

  it("has no accessibility violations", async () => {
    const { container } = await renderPlanner();
    await screen.findByText("Toward 124 credits");
    expect(await axeViolations(container)).toEqual([]);
  });
});
