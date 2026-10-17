import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TranscriptData } from "@workspace/api-client";
import { axeViolations } from "@workspace/ui/test/axe";
import { mockApi } from "@/test/api";
import { sampleAudit } from "@/test/audit";
import { renderPage } from "@/test/render";
import { TranscriptPage } from "./transcript-page";

const NOW = "2026-10-17T12:00:00.000Z";

const TRANSCRIPT: TranscriptData = {
  gpa: 3.42,
  courses: [
    {
      subject: "CIS",
      courseNumber: "1051",
      title: "Intro to Problem Solving",
      grade: "A",
      credits: 4,
      term: "Spring 2026",
    },
    {
      subject: "ENG",
      courseNumber: "0802",
      title: "Analytical Reading and Writing",
      grade: "A",
      credits: 4,
      term: "Fall 2025",
    },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

async function paste(text: string) {
  const user = userEvent.setup();
  const box = await screen.findByRole("textbox", {
    name: "Paste your unofficial transcript",
  });
  await user.click(box);
  await user.paste(text);
  await user.click(screen.getByRole("button", { name: "Read transcript" }));
}

describe("TranscriptPage", () => {
  it("reads pasted text into terms and saves only the courses", async () => {
    const parse = vi.fn(() => Response.json(TRANSCRIPT));
    mockApi({ "POST /api/transcript/parse": parse });
    const { store } = renderPage(<TranscriptPage />);
    await paste("CIS 1051 Intro to Problem Solving  A  4.00  Spring 2026");

    const spring = await screen.findByRole("article", { name: "Spring 2026" });
    expect(within(spring).getAllByText("CIS 1051").length).toBeGreaterThan(0);
    expect(screen.getByText("2 courses · 2 terms · GPA 3.42")).toBeTruthy();
    await waitFor(async () =>
      expect((await store.get("transcript"))?.transcript).toEqual(TRANSCRIPT),
    );
  });

  it("says when it finds no courses, and saves nothing", async () => {
    mockApi({
      "POST /api/transcript/parse": { courses: [], gpa: null },
    });
    const { store } = renderPage(<TranscriptPage />);
    await paste("Hello");
    expect(
      await screen.findByText(/We couldn't find any courses in that text/),
    ).toBeTruthy();
    expect(await store.get("transcript")).toBeNull();
  });

  it("shows what each course counts toward from the saved audit", async () => {
    const { store } = renderPage(<TranscriptPage />);
    await store.set("audit", { audit: sampleAudit(), storedAt: NOW });
    await store.set("transcript", { transcript: TRANSCRIPT, storedAt: NOW });
    const row = await screen.findByRole("row", { name: /CIS 1051/ });
    // Course, title, counts toward, credits, grade.
    expect(within(row).getAllByRole("cell")[2]!.textContent).toBe(
      "Intro to Problem Solving",
    );
    const eng = screen.getByRole("row", { name: /ENG 0802/ });
    expect(within(eng).getAllByRole("cell")[2]!.textContent).toBe("—");
  });

  it("has no accessibility violations", async () => {
    const { container, store } = renderPage(<TranscriptPage />);
    await store.set("transcript", { transcript: TRANSCRIPT, storedAt: NOW });
    await screen.findByRole("article", { name: "Spring 2026" });
    expect(await axeViolations(container)).toEqual([]);
  });
});
