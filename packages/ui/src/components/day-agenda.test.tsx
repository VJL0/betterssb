import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DayAgenda } from "@workspace/ui/components/day-agenda";
import type { WeekCalendarBlock } from "@workspace/ui/components/week-calendar";
import { axeViolations } from "../test/axe";

const H = 60;
const WEEK = ["M", "T", "W", "R", "F"] as const;

function block(overrides: Partial<WeekCalendarBlock>): WeekCalendarBlock {
  return {
    id: "41207-a",
    days: "TR",
    start: 9 * H + 30,
    end: 10 * H + 50,
    code: "CIS 2168",
    section: "001",
    title: "Data Structures",
    location: "SERC 116",
    kind: "Lecture",
    color: { slot: 1, hatched: false },
    ...overrides,
  };
}

const blocks = [
  block({}),
  block({
    id: "lab",
    days: "T",
    start: 13 * H,
    end: 14 * H + 50,
    section: "L01",
    kind: "Lab",
    appearance: "tint",
  }),
];

describe("DayAgenda", () => {
  it("opens on the first day with classes and counts each day's classes", () => {
    render(<DayAgenda blocks={blocks} days={WEEK} />);
    expect(
      screen
        .getByRole("tab", { name: "Tuesday, 2 classes" })
        .getAttribute("aria-selected"),
    ).toBe("true");
    expect(screen.getByRole("tab", { name: "Monday, 0 classes" })).toBeTruthy();
  });

  it("lists the day's classes in order with the free time between", () => {
    render(<DayAgenda blocks={blocks} days={WEEK} />);
    const items = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(items).toEqual([
      expect.stringContaining("CIS 2168 · 001 · Lecture"),
      expect.stringContaining("2h 10m free"),
      expect.stringContaining("CIS 2168 · L01 · Lab"),
    ]);
  });

  it("says when a day has no classes", () => {
    render(<DayAgenda blocks={blocks} days={WEEK} />);
    fireEvent.click(screen.getByRole("tab", { name: "Monday, 0 classes" }));
    expect(screen.getByText("No classes on Monday.")).toBeTruthy();
  });

  it("has no accessibility violations", async () => {
    const { container } = render(<DayAgenda blocks={blocks} days={WEEK} />);
    expect(await axeViolations(container)).toEqual([]);
  });
});
