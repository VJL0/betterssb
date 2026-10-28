import { afterEach, describe, expect, it, vi } from "vitest";
import { lookUpRegistrationTime } from "./tuportal-api";
import { PRIORITY_REGISTRATION_URL } from "./temple-urls";

const COUNTDOWN = `

{"items":[{"timeZone":"MN","formattedTime":"Wed Oct 28, 2026 7:00 AM EDT","dateTimestamp":"Wednesday October 28, 2026 7:00:00 AM EDT","desc":"2027 Spring"}]}`;

/** Answers every fetch with `body`, as if it came from `url` after any redirects. */
function stubFetch(
  body: string,
  url = PRIORITY_REGISTRATION_URL,
  status = 200,
) {
  const response = new Response(body, { status });
  Object.defineProperty(response, "url", { value: url });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
}

afterEach(() => vi.unstubAllGlobals());

describe("lookUpRegistrationTime", () => {
  it("finds the term's time in the countdown", async () => {
    stubFetch(COUNTDOWN);
    await expect(lookUpRegistrationTime("202703")).resolves.toEqual({
      status: "found",
      startsAt: "2026-10-28T11:00:00.000Z",
    });
    expect(fetch).toHaveBeenCalledWith(PRIORITY_REGISTRATION_URL, {
      credentials: "include",
    });
  });

  it("says when the countdown has no time for the term", async () => {
    stubFetch(COUNTDOWN);
    await expect(lookUpRegistrationTime("202736")).resolves.toEqual({
      status: "not-listed",
    });
    stubFetch('{"notFound":"No data for user."}');
    await expect(lookUpRegistrationTime("202703")).resolves.toEqual({
      status: "not-listed",
    });
  });

  it.each([
    [
      "Temple's sign-in host",
      "<html>Sign in</html>",
      "https://fim.temple.edu/idp/profile/SAML2",
    ],
    ["TUportal's login page", "<!DOCTYPE html>", PRIORITY_REGISTRATION_URL],
  ])("reports signed out on %s", async (_name, body, url) => {
    stubFetch(body, url);
    await expect(lookUpRegistrationTime("202703")).resolves.toEqual({
      status: "signed-out",
    });
  });

  it("fails on an HTTP error", async () => {
    stubFetch("", PRIORITY_REGISTRATION_URL, 500);
    await expect(lookUpRegistrationTime("202703")).rejects.toThrow(
      "TUportal returned HTTP 500",
    );
  });
});
