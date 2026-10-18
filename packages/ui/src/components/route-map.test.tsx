import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  AuditStatusIcon,
  RouteMap,
  auditStatusLabel,
} from "@workspace/ui/components/route-map";
import { axeViolations } from "../test/axe";

describe("AuditStatusIcon", () => {
  it.each([
    ["complete", "Done", "text-success"],
    ["in_progress", "In progress", "text-info"],
    ["incomplete", "Needed", "text-destructive"],
  ] as const)("names %s as %s", (status, label, tone) => {
    render(<AuditStatusIcon status={status} />);
    const icon = screen.getByRole("img", { name: label });
    expect(icon.getAttribute("class")).toContain(tone);
  });

  it("draws nothing for informational lines", () => {
    const { container } = render(<AuditStatusIcon status="none" />);
    expect(container.innerHTML).toBe("");
    expect(auditStatusLabel("none")).toBeNull();
  });
});

describe("RouteMap", () => {
  const items = [
    {
      id: "1",
      title: "CIS 1051 · Intro to Problem Solving",
      status: "complete",
      meta: "4/4",
    },
    {
      id: "2",
      title: "CIS 2168 · Data Structures",
      status: "incomplete",
      note: "Needs CIS 1068",
      action: <a href="/search">Find sections</a>,
    },
  ] as const;

  it("keeps requirement order and puts the state in text", () => {
    render(<RouteMap items={items} aria-label="Major requirements" />);
    const list = screen.getByRole("list", { name: "Major requirements" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByRole("img", { name: "Done" })).toBeTruthy();
    expect(rows[1]!.textContent).toContain("Needs CIS 1068");
    expect(
      within(rows[1]!).getByRole("link", { name: "Find sections" }),
    ).toBeTruthy();
  });

  it("has no axe violations", async () => {
    const { container } = render(
      <RouteMap items={items} aria-label="Major requirements" />,
    );
    expect(await axeViolations(container)).toEqual([]);
  });
});
