import { afterEach, describe, expect, it, vi } from "vitest";
import { searchProfessors } from "@workspace/api-client";
import { setUpApiClient } from "./api-client";
import { loggedFetch } from "./logged-fetch";
import { extensionStore } from "./local-store";
import { BANNER_ORIGIN } from "./temple-urls";

const CRN_DETAILS = `${BANNER_ORIGIN}/StudentRegistrationSsb/ssb/searchResults/getSectionDetailsFromCRN?courseReferenceNumber=41207&term=202703`;

afterEach(() => {
  vi.unstubAllGlobals();
});

async function loggedRequests() {
  const log = await extensionStore.get("requestLog");
  return log?.entries.map(({ method, url, status }) => ({
    method,
    url,
    status,
  }));
}

/** The log is written after the request returns, so tests wait for it. */
async function expectLogged(expected: unknown[]) {
  await vi.waitFor(async () =>
    expect(await loggedRequests()).toEqual(expected),
  );
}

describe("loggedFetch", () => {
  it("logs each request's method, URL and status, without the cache buster", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 200 })),
    );
    await loggedFetch(`${CRN_DETAILS}&_=1763337600000`);
    await loggedFetch(`${BANNER_ORIGIN}/x/submitRegistration/batch`, {
      method: "post",
    });
    await expectLogged([
      {
        method: "POST",
        url: `${BANNER_ORIGIN}/x/submitRegistration/batch`,
        status: 200,
      },
      { method: "GET", url: CRN_DETAILS, status: 200 },
    ]);
  });

  it("logs a request that never got an answer, and still fails it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    await expect(loggedFetch(CRN_DETAILS)).rejects.toThrow("Failed to fetch");
    await expectLogged([{ method: "GET", url: CRN_DETAILS, status: null }]);
  });

  it("logs a Request object by its own method and URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 201 })),
    );
    await loggedFetch(new Request(CRN_DETAILS, { method: "POST" }));
    await expectLogged([{ method: "POST", url: CRN_DETAILS, status: 201 }]);
  });

  it("logs the extension's BetterSSB API calls too", async () => {
    setUpApiClient();
    await searchProfessors({ query: { name: "Jane Smith" } });
    await expectLogged([
      {
        method: "GET",
        url: "http://localhost:8000/api/professors?name=Jane+Smith",
        status: 200,
      },
    ]);
  });
});
