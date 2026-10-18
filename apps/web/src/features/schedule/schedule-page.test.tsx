import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addSection,
  emptyPlan,
  plannedSectionFrom,
} from "@workspace/shared/lib/plan";
import { ssbSectionToInternal } from "@workspace/shared/lib/sections";
import { axeViolations } from "@workspace/ui/test/axe";
import type { GenerateRequest } from "@workspace/api-client";
import {
  API,
  FETCHED_AT,
  http,
  HttpResponse,
  problemResponse,
  server,
} from "@workspace/api-client/testing";
import {
  classSection,
  meetingTime,
} from "@workspace/shared/testing/class-section";
import { renderPage } from "@/test/render";
import { SchedulePage } from "./schedule-page";

const NOW = "2026-10-17T12:00:00.000Z";

const ds001 = classSection();
const ds002 = classSection({
  courseReferenceNumber: "41208",
  sequenceNumber: "002",
  meetings: [meetingTime("MWF", "1100", "1150")],
});
const sys001 = classSection({
  courseNumber: "2107",
  courseTitle: "Computer Systems",
  courseReferenceNumber: "41311",
  meetings: [meetingTime("MW", "1000", "1050")],
});
const ALL = [ds001, ds002, sys001];

const GENERATED = [
  {
    sections: [ds001, sys001].flatMap(ssbSectionToInternal),
    score: 92,
    warnings: [],
  },
  {
    sections: [ds002, sys001].flatMap(ssbSectionToInternal),
    score: 88,
    warnings: [],
  },
];
/** Every section of the planned courses: what the page must send to generate. */
const ALL_CRNS = new Set(ALL.map((s) => s.courseReferenceNumber));

let generationFails = false;

function sendsEveryPlannedSection(body: GenerateRequest): boolean {
  const sent = new Set(body.sections.map((m) => m.crn));
  return (
    sent.size === ALL_CRNS.size && [...sent].every((crn) => ALL_CRNS.has(crn))
  );
}

// Schedules come back only when the page sends every section of the planned
// courses, so "Schedule 1 of 2" on screen shows the request was right.
beforeEach(() => {
  vi.spyOn(toast, "success");
  generationFails = false;
  server.use(
    http.get(`${API}/classes/search`, ({ request }) => {
      const courseNumber = new URL(request.url).searchParams.get(
        "courseNumber",
      );
      return HttpResponse.json({
        totalCount: 0,
        fetchedAt: FETCHED_AT,
        sections: ALL.filter((s) => s.courseNumber === courseNumber),
      });
    }),
    http.post<never, GenerateRequest>(
      `${API}/schedule/generate`,
      async ({ request }) => {
        if (generationFails) {
          return problemResponse(503, "The schedule service timed out.");
        }
        const body = await request.json();
        return HttpResponse.json(
          sendsEveryPlannedSection(body) ? GENERATED : [],
        );
      },
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

async function renderWithPlan() {
  const view = renderPage(<SchedulePage />);
  const plan = [ds001, sys001].reduce(
    (p, s) => addSection(p, plannedSectionFrom(s, NOW), NOW),
    emptyPlan("202703", "Spring 2027"),
  );
  await view.store.set("plan:202703", plan);
  return view;
}

describe("SchedulePage", () => {
  it("sends students to Search when the plan has no courses", async () => {
    renderPage(<SchedulePage />);
    expect(
      await screen.findByText("Add courses to build a schedule"),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Search courses" }).getAttribute("href"),
    ).toBe("/search");
  });

  it("builds schedules from every section of the planned courses", async () => {
    await renderWithPlan();
    expect(await screen.findByText("Schedule 1 of 2")).toBeTruthy();
    expect(
      screen.getByText(
        "2 courses from your Spring 2027 plan · 2 schedules fit your rules",
      ),
    ).toBeTruthy();
  });

  it("switches with ] and saves the chosen schedule with an undo", async () => {
    const user = userEvent.setup();
    const { store } = await renderWithPlan();
    await screen.findByText("Schedule 1 of 2");
    expect(screen.getByRole("button", { name: "Saved to plan" })).toBeTruthy();

    await user.keyboard("]");
    expect(screen.getByText("Schedule 2 of 2")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Save to plan" }));
    await waitFor(async () => {
      const plan = await store.get("plan:202703");
      expect(plan?.sections.map((s) => s.crn).sort()).toEqual([
        "41208",
        "41311",
      ]);
    });
    expect(toast.success).toHaveBeenCalledWith(
      "Saved schedule 2 to your Spring 2027 plan",
      expect.objectContaining({
        action: expect.objectContaining({ label: "Undo" }),
      }),
    );
  });

  it("suggests a day to allow when the day rule leaves nothing", async () => {
    const user = userEvent.setup();
    await renderWithPlan();
    await screen.findByText("Schedule 1 of 2");
    await user.click(screen.getByRole("button", { name: "Monday" }));
    expect(await screen.findByText("No conflict-free schedule")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Allow Mondays" })).toBeTruthy();
  });

  it("keeps the last schedules when the service fails", async () => {
    const user = userEvent.setup();
    await renderWithPlan();
    await screen.findByText("Schedule 1 of 2");
    generationFails = true;
    await user.click(screen.getByRole("button", { name: "Friday" }));
    expect(await screen.findByText("Couldn't generate schedules")).toBeTruthy();
    expect(screen.getByText(/Your last 2 schedules from/)).toBeTruthy();
    expect(screen.getByText("Schedule 1 of 2")).toBeTruthy();
  });

  it("has no accessibility violations", async () => {
    const { container } = await renderWithPlan();
    await screen.findByText("Schedule 1 of 2");
    expect(await axeViolations(container)).toEqual([]);
  });
});
