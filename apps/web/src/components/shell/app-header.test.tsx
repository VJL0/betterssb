import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderPage } from "@/test/render";
import { AppHeader } from "./app-header";

describe("AppHeader", () => {
  it("opens settings from its menu", async () => {
    const user = userEvent.setup();
    renderPage(<AppHeader />);
    await user.click(
      screen.getByRole("button", { name: "Settings and feedback" }),
    );
    expect(
      (await screen.findByRole("menuitem", { name: "Settings" })).getAttribute(
        "href",
      ),
    ).toBe("/settings");
  });

  it("groups the page links by what the student is doing", () => {
    renderPage(<AppHeader />);
    const groups = {
      Planning: ["Search", "Schedule", "Plan"],
      Registration: ["Register", "Seats"],
      "Your degree": ["Records", "Advisor"],
    };
    for (const [group, pages] of Object.entries(groups)) {
      const list = screen.getByRole("list", { name: group });
      expect(
        within(list)
          .getAllByRole("link")
          .map((link) => link.textContent),
      ).toEqual(pages);
    }
  });

  it("leaves sign-in to the Seats page", () => {
    renderPage(<AppHeader />);
    expect(screen.queryByRole("link", { name: /Sign in/ })).toBeNull();
  });
});
