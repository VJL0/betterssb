import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RmpBadge } from "@workspace/ui/components/rmp-badge";
import { axeViolations } from "../test/axe";
import type { RmpRating } from "@workspace/api-client";

function rating(overrides: Partial<RmpRating> = {}): RmpRating {
  return {
    professorName: "Dana Whitlock",
    department: "Computer Science",
    overallRating: 4.6,
    difficulty: 3.2,
    wouldTakeAgainPct: 88,
    numRatings: 212,
    topTags: ["Clear grading"],
    rmpUrl: "https://www.ratemyprofessors.com/professor/1",
    ...overrides,
  };
}

describe("RmpBadge", () => {
  it("prints the score and difficulty and links to the profile", () => {
    render(<RmpBadge rating={rating()} />);
    const link = screen.getByRole("link");
    expect(link.textContent).toContain("4.6 · diff 3.2");
    expect(link.getAttribute("href")).toBe(
      "https://www.ratemyprofessors.com/professor/1",
    );
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("shows just the score when compact", () => {
    render(<RmpBadge rating={rating()} compact />);
    expect(screen.getByRole("link").textContent).toMatch(/^4\.6 rating for/);
  });

  it("says No RMP when compact and there's no profile", () => {
    render(<RmpBadge rating={null} compact />);
    expect(screen.getByText("No RMP").textContent).toBe("No RMP profile");
  });

  it("keeps the visible text at the start of the accessible name", () => {
    render(<RmpBadge rating={rating()} />);
    expect(
      screen.getByRole("link", {
        name: /^4\.6 · diff 3\.2 rating for Dana Whitlock on Rate My Professors/,
      }),
    ).toBeTruthy();
  });

  it("can add would-take-again", () => {
    render(<RmpBadge rating={rating()} showWouldTakeAgain />);
    expect(screen.getByRole("link").textContent).toContain(
      "4.6 · diff 3.2 · 88%",
    );
  });

  it.each([
    [4.6, "bg-primary"],
    [3.1, "bg-secondary"],
    [2.4, "bg-destructive/10"],
  ])("tints a %s rating with %s", (overallRating, cls) => {
    render(<RmpBadge rating={rating({ overallRating })} />);
    expect(screen.getByRole("link").className).toContain(cls);
  });

  it("is plain text when there's no profile link to open", () => {
    render(<RmpBadge rating={rating({ rmpUrl: "" })} />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("4.6 · diff 3.2").className).toContain(
      "bg-primary",
    );
  });

  it("shows a dashed, non-interactive badge without a profile", () => {
    render(<RmpBadge rating={null} />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("No RMP profile").className).toContain(
      "border-dashed",
    );
  });

  it("links an instructor without a profile to RMP's search", () => {
    render(
      <RmpBadge rating={null} instructorName="Bray, Benjamin R." compact />,
    );
    const link = screen.getByRole("link", {
      name: "No RMP profile, search Rate My Professors for Benjamin Bray, opens in a new tab",
    });
    expect(link.getAttribute("href")).toBe(
      "https://www.ratemyprofessors.com/search/professors/999?q=Benjamin%20Bray",
    );
    expect(link.className).toContain("border-dashed");
  });

  it("has no axe violations", async () => {
    const { container } = render(
      <div>
        <RmpBadge rating={rating()} />
        <RmpBadge rating={null} />
        <RmpBadge rating={null} instructorName="Bray, Benjamin R." />
      </div>,
    );
    expect(await axeViolations(container)).toEqual([]);
  });
});
