import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { SeatCounts } from "@workspace/shared/lib/seats";
import { SeatMeter } from "@workspace/ui/components/seat-meter";
import { axeViolations } from "../test/axe";

const OPEN: SeatCounts = {
  seatsAvailable: 12,
  maximumEnrollment: 40,
  waitCount: 0,
  waitCapacity: 10,
  waitAvailable: 10,
};

describe("SeatMeter", () => {
  it("shows the word and the count", () => {
    const { container } = render(<SeatMeter {...OPEN} />);
    expect(screen.getByText("12 open").className).toContain("text-success");
    expect(container.textContent).toContain("28/40");
  });

  it("leaves the count to Banner's text when inline", () => {
    const { container } = render(<SeatMeter {...OPEN} size="inline" />);
    expect(container.textContent).toContain("12 open");
    expect(container.textContent).not.toContain("28/40");
    expect(screen.getByRole("progressbar").getAttribute("aria-valuetext")).toBe(
      "12 open, 28 of 40 seats taken",
    );
  });

  it("exposes the reading as a progressbar", () => {
    render(<SeatMeter {...OPEN} />);
    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("28");
    expect(bar.getAttribute("aria-valuemax")).toBe("40");
    expect(bar.getAttribute("aria-valuetext")).toBe(
      "12 open, 28 of 40 seats taken",
    );
  });

  it("colors the bar by status", () => {
    const { container } = render(
      <SeatMeter
        {...OPEN}
        seatsAvailable={0}
        waitCount={4}
        waitAvailable={6}
      />,
    );
    expect(screen.getByText("Full · waitlist 4/10")).toBeTruthy();
    expect((container.firstElementChild as HTMLElement).className).toContain(
      "bg-destructive",
    );
  });

  it("has no axe violations", async () => {
    const { container } = render(<SeatMeter {...OPEN} seatsAvailable={3} />);
    expect(await axeViolations(container)).toEqual([]);
  });
});
