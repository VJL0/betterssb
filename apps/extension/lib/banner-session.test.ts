import { afterEach, describe, expect, it, vi } from "vitest";
import { stoppedRedirect } from "@/test/responses";
import {
  BANNER_MENU_URL,
  isSignedInToBanner,
  menuIsSignedIn,
} from "./banner-session";

// Trimmed from the self-service menu in data/ssb/login check.har.
const GUEST_MENU = "<NavigationEntries />";
const STUDENT_MENU = `<NavigationEntries>
  <NavigationEntryValueObject id='63-1' menu='Banner' form='bmenu.P_GenMnu' name='Personal Information' caption='Personal Information' type='MENU' />
</NavigationEntries>`;

function stubFetch(response: Response) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
}

afterEach(() => vi.unstubAllGlobals());

describe("menuIsSignedIn", () => {
  it("tells a student's menu from a guest's", () => {
    expect(menuIsSignedIn(STUDENT_MENU)).toBe(true);
    expect(menuIsSignedIn(GUEST_MENU)).toBe(false);
    expect(menuIsSignedIn("")).toBe(false);
  });
});

describe("isSignedInToBanner", () => {
  it("asks with the student's cookies and is signed in on their menu", async () => {
    stubFetch(new Response(STUDENT_MENU));
    await expect(isSignedInToBanner()).resolves.toBe(true);
    expect(fetch).toHaveBeenCalledWith(BANNER_MENU_URL, {
      credentials: "include",
      redirect: "manual",
      cache: "no-store",
    });
  });

  it("is signed out when the session has no student on it", async () => {
    stubFetch(new Response(GUEST_MENU));
    await expect(isSignedInToBanner()).resolves.toBe(false);
  });

  it.each([
    ["a redirect to sign in", stoppedRedirect()],
    ["a 401", new Response("", { status: 401 })],
    ["a 403", new Response("", { status: 403 })],
  ])("is signed out on %s", async (_name, response) => {
    stubFetch(response);
    await expect(isSignedInToBanner()).resolves.toBe(false);
  });

  it("fails when Banner does, without guessing", async () => {
    stubFetch(new Response("", { status: 503 }));
    await expect(isSignedInToBanner()).rejects.toThrow(
      "Banner returned HTTP 503",
    );
  });
});
