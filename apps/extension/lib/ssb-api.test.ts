import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BANNER_ORIGIN } from "./temple-urls";

const SSB = `${BANNER_ORIGIN}/StudentRegistrationSsb/ssb`;
const TERMS = [{ code: "202703", description: "2027 Spring" }];

function page(token: string): Response {
  return new Response(`<meta name="synchronizerToken" content="${token}"/>`);
}

function stoppedRedirect(): Response {
  const response = new Response(null);
  Object.defineProperty(response, "type", { value: "opaqueredirect" });
  Object.defineProperty(response, "status", { value: 0 });
  return response;
}

/** Answers each Banner request with the next response queued for its path. */
function stubBanner(answers: Record<string, Response[]>) {
  const fetchMock = vi.fn<
    (url: string, init?: RequestInit) => Promise<Response>
  >((url) => {
    const path = new URL(url).pathname.replace(
      "/StudentRegistrationSsb/ssb",
      "",
    );
    const next = answers[path]?.shift();
    if (!next) throw new Error(`Unexpected request to ${path}`);
    return Promise.resolve(next);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

// The client keeps its token between calls, so each test starts fresh.
async function loadClient() {
  return import("./ssb-api");
}

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

describe("ssb-api from the background", () => {
  it("reads a token from a Banner page, then calls with the student's cookies", async () => {
    const fetchMock = stubBanner({
      "/term/termSelection": [page("11111111-1111-1111-1111-111111111111")],
      "/classRegistration/getTerms": [Response.json(TERMS)],
    });
    const ssb = await loadClient();

    await expect(ssb.getRegistrationTerms()).resolves.toEqual(TERMS);
    // Not the /registration landing page: loading it signs the student out.
    expect(fetchMock.mock.calls[0]![0]).toBe(
      `${SSB}/term/termSelection?mode=registration`,
    );
    const [url, init] = fetchMock.mock.calls[1]!;
    expect(url.startsWith(`${SSB}/classRegistration/getTerms?`)).toBe(true);
    expect(init).toMatchObject({
      credentials: "include",
      redirect: "manual",
      headers: {
        "X-Synchronizer-Token": "11111111-1111-1111-1111-111111111111",
      },
    });
  });

  it("says Banner signed the student out when it redirects to sign in", async () => {
    stubBanner({ "/term/termSelection": [stoppedRedirect()] });
    const ssb = await loadClient();

    await expect(ssb.getRegistrationTerms()).rejects.toBeInstanceOf(
      ssb.BannerSignedOutError,
    );
  });

  it("opens registration for the term before a registration call", async () => {
    const fetchMock = stubBanner({
      "/term/termSelection": [page("11111111-1111-1111-1111-111111111111")],
      "/term/saveTerm": [Response.json({})],
      "/term/search": [Response.json({ fwdURL: "/classRegistration" })],
      "/classRegistration/classRegistration": [
        page("22222222-2222-2222-2222-222222222222"),
      ],
      "/classRegistration/getPlans": [Response.json({ plans: [] })],
    });
    const ssb = await loadClient();

    await ssb.openRegistration("202703");
    await expect(ssb.getPlans()).resolves.toEqual({ plans: [] });
    const [, plansInit] = fetchMock.mock.calls.at(-1)!;
    expect(plansInit?.headers).toMatchObject({
      "X-Synchronizer-Token": "22222222-2222-2222-2222-222222222222",
    });
  });

  it("stops when Banner won't open registration, before a call that would sign the student out", async () => {
    stubBanner({
      "/term/termSelection": [page("11111111-1111-1111-1111-111111111111")],
      "/term/saveTerm": [Response.json({})],
      "/term/search": [
        Response.json({
          studentEligValid: false,
          studentEligFailures: [
            "Time tickets prevent registration at this time.",
          ],
        }),
      ],
    });
    const ssb = await loadClient();

    const opening = ssb.openRegistration("202703");
    await expect(opening).rejects.toBeInstanceOf(ssb.RegistrationClosedError);
    await expect(opening).rejects.toThrow(
      "Time tickets prevent registration at this time.",
    );
  });

  it("retries once with a fresh token when a kept one has gone stale", async () => {
    stubBanner({
      "/term/termSelection": [
        page("11111111-1111-1111-1111-111111111111"),
        page("22222222-2222-2222-2222-222222222222"),
      ],
      "/classRegistration/getTerms": [
        Response.json(TERMS),
        new Response("", { status: 403 }),
        Response.json(TERMS),
      ],
    });
    const ssb = await loadClient();

    await ssb.getRegistrationTerms();
    await expect(ssb.getRegistrationTerms()).resolves.toEqual(TERMS);
  });
});
