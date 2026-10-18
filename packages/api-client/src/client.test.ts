import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  onTestFinished,
} from "vitest";
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
import {
  API,
  HttpResponse,
  http,
  problemResponse,
  recordRequests,
  server,
} from "./testing";

// Node's Request needs an absolute URL; browsers resolve "/api/…" themselves.
const ORIGIN = "http://localhost:5173";

beforeAll(() => {
  server.listen({ onUnhandledFrame: "error" });
});

beforeEach(() => {
  configureApiClient({ origin: ORIGIN });
});

afterEach(() => {
  server.resetHandlers();
  server.events.removeAllListeners();
});

afterAll(() => {
  server.close();
});

/**
 * The Requests the client hands to fetch. Credentials never reach the wire in
 * Node, so MSW can't see them; they're checked on the client's own Request.
 */
function requestsBuilt(): Request[] {
  const built: Request[] = [];
  const id = client.interceptors.request.use((request) => {
    built.push(request);
    return request;
  });
  onTestFinished(() => client.interceptors.request.eject(id));
  return built;
}

/** Answers GET /api/classes/terms with `response`. */
function termsAnswer(response: () => Response) {
  server.use(http.get(`${API}/classes/terms`, response));
}

// Building the request is this client's job, so these tests read the
// requests it sends (the case MSW's life-cycle events are for).
describe("requests", () => {
  it("calls /api and leaves out query values that aren't set", async () => {
    const sent = recordRequests("GET /api/classes/search");
    const built = requestsBuilt();
    await searchSections({
      query: { term: "202703", subject: "CIS", courseNumber: undefined },
    });
    const url = new URL(sent[0]!.url);
    expect(url.pathname).toBe("/api/classes/search");
    expect(url.search).toBe("?term=202703&subject=CIS");
    expect(built[0]!.credentials).toBe("same-origin");
  });

  it("uses the extension's origin and sends its session cookie", async () => {
    configureApiClient({
      origin: "https://api.example.edu/",
      credentials: "include",
    });
    const sent = recordRequests("GET /api/classes/terms");
    const built = requestsBuilt();
    await listTerms();
    expect(sent[0]!.url).toBe("https://api.example.edu/api/classes/terms");
    expect(built[0]!.credentials).toBe("include");
  });

  it("sends a plain-text body as text", async () => {
    const sent = recordRequests("POST /api/transcript/parse");
    await parseTranscript({ body: "CIS 1068 A 4.0" });
    expect(sent[0]!.headers.get("Content-Type")).toBe("text/plain");
    expect(await sent[0]!.text()).toBe("CIS 1068 A 4.0");
  });

  it("resolves with the data", async () => {
    termsAnswer(() =>
      HttpResponse.json([{ code: "202703", description: "2027 Spring" }]),
    );
    const { data } = await listTerms();
    expect(data).toEqual([{ code: "202703", description: "2027 Spring" }]);
  });
});

describe("errors", () => {
  it("throws an ApiError with the problem's detail", async () => {
    termsAnswer(() => problemResponse(502, "Banner isn't responding."));
    const error = await listTerms().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 502,
      message: "Banner isn't responding.",
      problem: { status: 502 },
    });
  });

  it("falls back to the caller's message without a detail", async () => {
    termsAnswer(() => new HttpResponse("oops", { status: 500 }));
    await expect(
      listTerms({ meta: { errorMessage: "Couldn't load terms." } }),
    ).rejects.toMatchObject({ status: 500, message: "Couldn't load terms." });
  });

  it("says what failed when there's no message at all", async () => {
    termsAnswer(() => problemResponse(404));
    await expect(listTerms()).rejects.toMatchObject({
      message: "Something went wrong (HTTP 404).",
    });
  });

  it("throws a NetworkError when the request gets no response", async () => {
    termsAnswer(() => HttpResponse.error());
    await expect(listTerms()).rejects.toBeInstanceOf(NetworkError);
  });

  it("lets an abort through, so a cancel isn't shown as a failure", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      listTerms({ signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
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
