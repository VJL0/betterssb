import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CourseBadge, CourseDot } from "@workspace/ui/components/course-badge";
import { DayStrip } from "@workspace/ui/components/day-strip";
import { SampleDataBadge } from "@workspace/ui/components/sample-data-badge";
import { StatusBadge } from "@workspace/ui/components/status-badge";
import { axeViolations } from "../test/axe";

describe("StatusBadge", () => {
  it("pairs an icon with the word", () => {
    render(<StatusBadge tone="success">Prereqs met</StatusBadge>);
    const badge = screen.getByText("Prereqs met");
    expect(badge.querySelector("svg[aria-hidden]")).not.toBeNull();
    expect(badge.className).toContain("text-success");
  });

  it("draws the neutral tone as a dashed outline", () => {
    render(<StatusBadge tone="neutral">Add transcript to check</StatusBadge>);
    expect(screen.getByText("Add transcript to check").className).toContain(
      "border-dashed",
    );
  });
});

describe("CourseBadge", () => {
  it("uses the course color once planned", () => {
    render(<CourseBadge code="CIS 2168" color={{ slot: 3, hatched: false }} />);
    expect(screen.getByText("CIS 2168").className).toContain("bg-course-3");
  });

  it("is an outline before the course is planned", () => {
    render(<CourseBadge code="CIS 2168" />);
    const badge = screen.getByText("CIS 2168");
    expect(badge.className).not.toContain("bg-course");
    expect(badge.dataset.variant ?? badge.className).toMatch(
      /outline|border-border/,
    );
  });

  it("hatches courses past the eighth", () => {
    render(<CourseBadge code="HIST 1102" color={{ slot: 1, hatched: true }} />);
    expect(screen.getByText("HIST 1102").className).toContain(
      "repeating-linear-gradient",
    );
  });

  it("keeps the dot out of the accessibility tree", () => {
    const { container } = render(
      <CourseDot color={{ slot: 2, hatched: false }} />,
    );
    expect(container.firstElementChild?.getAttribute("aria-hidden")).toBe(
      "true",
    );
  });
});

describe("SampleDataBadge", () => {
  it("says sample data", () => {
    render(<SampleDataBadge />);
    expect(screen.getByText("Sample data")).toBeTruthy();
  });
});

describe("DayStrip", () => {
  it("names the meeting days for screen readers", () => {
    render(<DayStrip days="TR" />);
    expect(
      screen.getByRole("img", { name: "Meets Tuesday and Thursday" }),
    ).toBeTruthy();
  });

  it("adds weekend days only when the section meets then", () => {
    const { container, rerender } = render(<DayStrip days="MW" />);
    expect(container.textContent).toBe("MTWRF");
    rerender(<DayStrip days="S" />);
    expect(container.textContent).toBe("MTWRFS");
  });

  it("says when there are no set days", () => {
    render(<DayStrip days="" />);
    expect(
      screen.getByRole("img", { name: "No set meeting days" }),
    ).toBeTruthy();
  });
});

describe("badges accessibility", () => {
  it("has no axe violations", async () => {
    const { container } = render(
      <div>
        <StatusBadge tone="destructive">Missing MATH 1042</StatusBadge>
        <CourseBadge code="CIS 2168" color={{ slot: 1, hatched: false }} />
        <SampleDataBadge />
        <DayStrip days="MWF" />
      </div>,
    );
    expect(await axeViolations(container)).toEqual([]);
  });
});
