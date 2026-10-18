import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  NetworkError,
  client,
  configureApiClient,
  listTerms,
  parseTranscript,
  queryError,
  searchSections,
} from "./index";
import * as generated from "./generated";

const fetchMock = vi.fn<typeof fetch>();

/** The generated client always calls fetch with a Request. */
function sentRequest(): Request {
  return fetchMock.mock.calls[0]![0] as Request;
}

// Node's Request needs an absolute URL; browsers resolve "/api/…" themselves.
const ORIGIN = "http://localhost:5173";

beforeEach(() => {
  configureApiClient({ origin: ORIGIN });
  client.setConfig({ fetch: fetchMock });
});

afterEach(() => {
  fetchMock.mockReset();
});

function problem(status: number, detail?: string) {
  return Response.json(
    { type: "about:blank", title: "Error", status, detail },
    { status, headers: { "Content-Type": "application/problem+json" } },
  );
}

describe("requests", () => {
  it("calls /api and leaves out query values that aren't set", async () => {
    fetchMock.mockResolvedValue(
      Response.json({ totalCount: 0, sections: [], fetchedAt: "" }),
    );
    await searchSections({
      query: { term: "202703", subject: "CIS", courseNumber: undefined },
    });
    const request = sentRequest();
    expect(new URL(request.url).pathname).toBe("/api/classes/search");
    expect(new URL(request.url).search).toBe("?term=202703&subject=CIS");
    expect(request.credentials).toBe("same-origin");
  });

  it("uses the extension's origin and sends its session cookie", async () => {
    configureApiClient({
      origin: "https://api.example.edu/",
      credentials: "include",
    });
    client.setConfig({ fetch: fetchMock });
    fetchMock.mockResolvedValue(Response.json([]));
    await listTerms();
    const request = sentRequest();
    expect(request.url).toBe("https://api.example.edu/api/classes/terms");
    expect(request.credentials).toBe("include");
  });

  it("sends a plain-text body as text", async () => {
    fetchMock.mockResolvedValue(Response.json({ courses: [], gpa: null }));
    await parseTranscript({ body: "CIS 1068 A 4.0" });
    const request = sentRequest();
    expect(request.headers.get("Content-Type")).toBe("text/plain");
    expect(await request.text()).toBe("CIS 1068 A 4.0");
  });

  it("resolves with the data", async () => {
    fetchMock.mockResolvedValue(
      Response.json([{ code: "202703", description: "2027 Spring" }]),
    );
    const { data } = await listTerms();
    expect(data).toEqual([{ code: "202703", description: "2027 Spring" }]);
  });
});

describe("errors", () => {
  it("throws an ApiError with the problem's detail", async () => {
    fetchMock.mockResolvedValue(problem(502, "Banner isn't responding."));
    const error = await listTerms().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 502,
      message: "Banner isn't responding.",
      problem: { status: 502 },
    });
  });

  it("falls back to the caller's message without a detail", async () => {
    fetchMock.mockResolvedValue(new Response("oops", { status: 500 }));
    await expect(
      listTerms({ meta: { errorMessage: "Couldn't load terms." } }),
    ).rejects.toMatchObject({ status: 500, message: "Couldn't load terms." });
  });

  it("says what failed when there's no message at all", async () => {
    fetchMock.mockResolvedValue(problem(404));
    await expect(listTerms()).rejects.toMatchObject({
      message: "Something went wrong (HTTP 404).",
    });
  });

  it("throws a NetworkError when the request gets no response", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(listTerms()).rejects.toBeInstanceOf(NetworkError);
  });

  it("lets an abort through, so a cancel isn't shown as a failure", async () => {
    const abort = new DOMException("Aborted", "AbortError");
    fetchMock.mockRejectedValue(abort);
    await expect(listTerms()).rejects.toBe(abort);
  });
});

describe("generated names", () => {
  it("has no numbered names from a schema and operation colliding", () => {
    expect(Object.keys(generated).filter((name) => /\d$/.test(name))).toEqual(
      [],
    );
  });
});

describe("queryError", () => {
  it("keeps errors and reads a raw problem body", () => {
    const network = new NetworkError();
    expect(queryError(null)).toBeNull();
    expect(queryError(network)).toBe(network);
    expect(
      queryError({ type: "about:blank", title: "Bad Gateway", status: 502 }),
    ).toMatchObject({ status: 502, message: "Bad Gateway" });
  });
});
