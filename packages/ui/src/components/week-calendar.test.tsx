import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  WeekCalendar,
  type WeekCalendarBlock,
} from "@workspace/ui/components/week-calendar";
import { axeViolations } from "../test/axe";

const H = 60;

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

describe("WeekCalendar", () => {
  it("lists each day's classes for screen readers", () => {
    render(<WeekCalendar blocks={[block({})]} />);
    const tuesday = screen.getByRole("list", { name: "Tuesday" });
    expect(within(tuesday).getAllByRole("listitem")).toHaveLength(1);
    expect(tuesday.textContent).toContain(
      "CIS 2168 001, Data Structures, Lecture, 9:30 to 10:50 AM, SERC 116",
    );
    expect(
      within(screen.getByRole("list", { name: "Monday" })).queryAllByRole(
        "listitem",
      ),
    ).toHaveLength(0);
  });

  it("shows weekend columns only when a class meets then", () => {
    const { rerender } = render(<WeekCalendar blocks={[block({})]} />);
    expect(screen.queryByRole("list", { name: "Saturday" })).toBeNull();
    rerender(<WeekCalendar blocks={[block({ days: "S" })]} />);
    expect(screen.getByRole("list", { name: "Saturday" })).toBeTruthy();
  });

  it("shows as many lines as fit: heading, title, time, then room", () => {
    const { container } = render(
      <WeekCalendar
        blocks={[
          block({ id: "long", days: "M", start: 9 * H, end: 10 * H + 20 }),
          block({ id: "fifty", days: "T", start: 9 * H, end: 9 * H + 50 }),
          block({ id: "short", days: "W", start: 9 * H, end: 9 * H + 25 }),
        ]}
      />,
    );
    const visuals = container.querySelectorAll("li [aria-hidden='true']");
    const [long, fifty, short] = Array.from(visuals).map((v) => v.textContent);
    expect(long).toContain("Data Structures");
    expect(long).toContain("SERC 116");
    expect(fifty).toContain("9:00–9:50 AM");
    expect(fifty).not.toContain("Data Structures");
    expect(fifty).not.toContain("SERC 116");
    expect(short).toBe("CIS 2168 · 001");
  });

  it("splits overlapping classes and names the overlap", () => {
    const { container } = render(
      <WeekCalendar
        blocks={[
          block({ id: "a", days: "W", start: 13 * H, end: 14 * H + 15 }),
          block({
            id: "b",
            code: "CIS 2107",
            days: "W",
            start: 13 * H,
            end: 13 * H + 15,
            color: { slot: 2, hatched: false },
          }),
        ]}
      />,
    );
    const wednesday = screen.getByRole("list", { name: "Wednesday" });
    expect(wednesday.textContent).toContain(
      "overlaps another class 1:00 to 1:15 PM",
    );
    // One visual label per clash, drawn across the column.
    expect(container.textContent?.match(/Overlaps 1:00–1:15 PM/g)).toHaveLength(
      1,
    );
  });

  it("draws gaps of an hour or more", () => {
    render(
      <WeekCalendar
        blocks={[
          block({ id: "a", days: "F", start: 9 * H, end: 10 * H }),
          block({ id: "b", days: "F", start: 11 * H + 10, end: 12 * H }),
        ]}
      />,
    );
    expect(screen.getByRole("list", { name: "Friday" }).textContent).toContain(
      "1h 10m gap",
    );
  });

  it("can hide gaps", () => {
    render(
      <WeekCalendar
        showGaps={false}
        blocks={[
          block({ id: "a", days: "F", start: 9 * H, end: 10 * H }),
          block({ id: "b", days: "F", start: 12 * H, end: 13 * H }),
        ]}
      />,
    );
    expect(
      screen.getByRole("list", { name: "Friday" }).textContent,
    ).not.toContain("gap");
  });

  it("marks previews and pinned classes in the description", () => {
    render(
      <WeekCalendar
        blocks={[
          block({ id: "a", days: "M", pinned: true }),
          block({ id: "b", days: "W", ghost: true }),
        ]}
      />,
    );
    expect(screen.getByRole("list", { name: "Monday" }).textContent).toContain(
      "pinned",
    );
    expect(
      screen.getByRole("list", { name: "Wednesday" }).textContent,
    ).toContain("preview");
  });

  it("tints labs with the course color", () => {
    const { container } = render(
      <WeekCalendar
        blocks={[block({ appearance: "tint", kind: "Lab", days: "M" })]}
      />,
    );
    const visual = container.querySelector<HTMLElement>(
      "li [aria-hidden='true']",
    );
    expect(visual?.getAttribute("style")).toContain("var(--course-1)");
    expect(visual?.className).not.toContain("bg-course-1");
  });

  it("flags a low instructor rating on the block", () => {
    render(<WeekCalendar blocks={[block({ days: "M", rating: 2.4 })]} />);
    expect(screen.getByRole("list", { name: "Monday" }).textContent).toContain(
      "2.4",
    );
  });

  it("lists sections without a meeting time under the grid", () => {
    render(
      <WeekCalendar
        blocks={[]}
        unscheduled={[
          {
            id: "x",
            code: "CIS 2400",
            section: "701",
            title: "Computer Systems",
            note: "Online, no set meeting time",
          },
        ]}
      />,
    );
    const tray = screen.getByRole("region", { name: "No set meeting time" });
    expect(tray.textContent).toContain("CIS 2400 · 701");
  });

  it("has no axe violations", async () => {
    const { container } = render(
      <WeekCalendar
        blocks={[
          block({ id: "a" }),
          block({ id: "b", days: "M", start: 9 * H, end: 9 * H + 20 }),
          block({ id: "c", days: "W", appearance: "tint", kind: "Lab" }),
        ]}
        unscheduled={[
          { id: "x", code: "CIS 2400", section: "701", title: "Systems" },
        ]}
      />,
    );
    expect(await axeViolations(container)).toEqual([]);
  });
});
