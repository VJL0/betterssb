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
    const thisTerm = screen.getByRole("list", { name: "This term" });
    const yourDegree = screen.getByRole("list", { name: "Your degree" });
    expect(
      within(thisTerm).getByRole("link", { name: "Register" }),
    ).toBeTruthy();
    expect(
      within(yourDegree).getByRole("link", { name: "Records" }),
    ).toBeTruthy();
  });

  it("leaves sign-in to the Seats page", () => {
    renderPage(<AppHeader />);
    expect(screen.queryByRole("link", { name: /Sign in/ })).toBeNull();
  });
});
