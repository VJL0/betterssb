import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderPage } from "@/test/render";
import { MobileNavMenu } from "./mobile-nav-menu";
import { PAGE_GROUP_LABELS, groupedPages } from "./pages";

describe("MobileNavMenu", () => {
  it("lists every page in its group, then settings, marking the current one", async () => {
    const user = userEvent.setup();
    renderPage(<MobileNavMenu />, { route: "/register" });
    await user.click(screen.getByRole("button", { name: "Menu" }));

    for (const { group, pages } of groupedPages()) {
      const section = screen.getByRole("region", {
        name: PAGE_GROUP_LABELS[group],
      });
      for (const page of pages) {
        expect(
          within(section).getByRole("link", { name: page.label }),
        ).toBeTruthy();
      }
    }
    expect(screen.getByRole("link", { name: "Settings" })).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Register" })
        .getAttribute("aria-current"),
    ).toBe("page");
  });

  it("closes when a page is chosen", async () => {
    const user = userEvent.setup();
    renderPage(<MobileNavMenu />);
    await user.click(screen.getByRole("button", { name: "Menu" }));
    await user.click(screen.getByRole("link", { name: "Plan" }));
    await waitFor(() =>
      expect(screen.queryByRole("link", { name: "Plan" })).toBeNull(),
    );
  });
});
