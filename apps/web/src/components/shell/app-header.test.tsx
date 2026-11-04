import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  API,
  http,
  problemResponse,
  server,
} from "@workspace/api-client/testing";
import { renderPage } from "@/test/render";
import { AppHeader } from "./app-header";

function signedOut() {
  server.use(http.get(`${API}/auth/me`, () => problemResponse(401)));
}

describe("AppHeader", () => {
  it("offers sign-in to a guest that comes back to this page", async () => {
    signedOut();
    renderPage(<AppHeader />, { route: "/search?q=CIS 1001" });
    const signIn = await screen.findByRole("link", { name: "Sign in" });
    expect(signIn.getAttribute("href")).toBe(
      "/api/auth/google/login?next=%2Fsearch%3Fq%3DCIS%2B1001",
    );
  });

  it("still offers sign-in when the API can't say who's signed in", async () => {
    server.use(http.get(`${API}/auth/me`, () => problemResponse(500)));
    renderPage(<AppHeader />);
    expect(await screen.findByRole("link", { name: "Sign in" })).toBeTruthy();
  });

  it("shows who's signed in and signs them out", async () => {
    const user = userEvent.setup();
    renderPage(<AppHeader />);
    await user.click(
      await screen.findByRole("button", { name: "Account and settings" }),
    );
    expect(await screen.findByText("Test Student")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();

    await user.click(screen.getByRole("menuitem", { name: "Sign out" }));
    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Sign in" })).toBeTruthy(),
    );
  });
});
