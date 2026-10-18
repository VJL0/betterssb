import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, NetworkError, postJson, requestJson } from "./http";

function mockFetch(response: Response | Error | DOMException) {
  const fetchMock = vi.fn(async () => {
    if (!(response instanceof Response)) throw response;
    return response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("requestJson", () => {
  it("calls /api with only the query values that are set", async () => {
    const fetchMock = mockFetch(Response.json([]));
    await requestJson("/classes/search", {
      query: {
        term: "202703",
        subject: "CIS",
        keyword: "",
        offset: 0,
        limit: undefined,
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/classes/search?term=202703&subject=CIS&offset=0",
      {},
    );
  });

  it("shows the problem detail from the API", async () => {
    mockFetch(
      Response.json(
        {
          title: "Bad Gateway",
          status: 502,
          detail: "Banner isn't responding.",
        },
        {
          status: 502,
          headers: { "Content-Type": "application/problem+json" },
        },
      ),
    );
    const error = await requestJson("/classes/terms").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 502,
      message: "Banner isn't responding.",
    });
  });

  it("falls back to the caller's message without a detail", async () => {
    mockFetch(new Response("oops", { status: 500 }));
    await expect(
      requestJson("/classes/terms", { errorMessage: "Couldn't load terms." }),
    ).rejects.toThrow("Couldn't load terms.");
  });

  it("reports a network failure in plain words", async () => {
    mockFetch(new TypeError("Failed to fetch"));
    await expect(requestJson("/classes/terms")).rejects.toBeInstanceOf(
      NetworkError,
    );
  });

  it("lets aborts through unchanged", async () => {
    mockFetch(new DOMException("aborted", "AbortError"));
    await expect(requestJson("/classes/terms")).rejects.toMatchObject({
      name: "AbortError",
    });
  });
});

describe("postJson", () => {
  it("sends a JSON body", async () => {
    const fetchMock = mockFetch(Response.json({ response: "hi" }));
    await postJson("/chat/", { messages: [] });
    expect(fetchMock).toHaveBeenCalledWith("/api/chat/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"messages":[]}',
    });
  });
});
