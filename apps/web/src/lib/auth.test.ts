import { afterEach, expect, it } from "vitest";
import { takeAuthError } from "./auth";

function visit(query: string) {
  window.history.replaceState(null, "", `/search${query}`);
}

afterEach(() => visit(""));

it("returns null without an auth_error", () => {
  visit("?term=202503");
  expect(takeAuthError()).toBeNull();
});

it("returns the message for a known code and clears it from the address", () => {
  visit("?term=202503&auth_error=access_denied");

  expect(takeAuthError()).toBe("Sign-in was cancelled.");
  expect(window.location.search).toBe("?term=202503");
});

it.each(["unknown", "toString", "constructor"])(
  "falls back to the generic message for %s",
  (code) => {
    visit(`?auth_error=${code}`);
    expect(takeAuthError()).toBe("Sign-in failed. Please try again.");
  },
);
