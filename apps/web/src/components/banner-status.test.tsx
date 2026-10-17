import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { axeViolations } from "@workspace/ui/test/axe";
import {
  BannerBadge,
  BannerNotConnected,
  BannerSignedOutAlert,
} from "./banner-status";

function renderInRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("BannerBadge", () => {
  it.each([
    ["connected", "Banner connected"],
    ["not-connected", "Connect Banner"],
    ["signed-out", "Banner signed out"],
  ] as const)("names the %s state in words", (connection, text) => {
    renderInRouter(<BannerBadge connection={connection} />);
    const link = screen.getByRole("link", { name: text });
    expect(link.getAttribute("href")).toBe("/settings#banner");
  });

  it("shows nothing until the first check finishes", () => {
    const { container } = renderInRouter(<BannerBadge connection={null} />);
    expect(container.innerHTML).toBe("");
  });
});

describe("Banner page states", () => {
  it("explains a signed-out session with one fix", async () => {
    const { container } = renderInRouter(<BannerSignedOutAlert />);
    expect(screen.getByRole("alert").textContent).toContain(
      "Banner signed you out",
    );
    expect(screen.getByRole("link", { name: "Open Banner" })).toBeTruthy();
    expect(await axeViolations(container)).toEqual([]);
  });

  it("points to Banner when the extension is installed", () => {
    renderInRouter(
      <BannerNotConnected
        title="Connect Banner to run your audit"
        description="The audit runs in your own Banner session."
        extensionInstalled
      />,
    );
    expect(screen.getByRole("link", { name: "Open Banner" })).toBeTruthy();
  });

  it("offers no install link while the extension isn't published", () => {
    renderInRouter(
      <BannerNotConnected
        title="Connect Banner to run your audit"
        description="The audit runs in your own Banner session."
        extensionInstalled={false}
      />,
    );
    expect(screen.queryByRole("link")).toBeNull();
  });
});
