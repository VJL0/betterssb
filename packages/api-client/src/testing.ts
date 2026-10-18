/**
 * Test helpers for code that calls the API through this client: answer its
 * requests by route without a network. Only for tests (it imports Vitest).
 */
import { vi } from "vitest";
import { client } from "./generated/client.gen";

/** What a route answers: a body to send as JSON, or a function for anything else. */
export type Route =
  unknown | ((request: Request) => Response | Promise<Response>);

function notFound(request: Request): Response {
  const { pathname } = new URL(request.url);
  return Response.json(
    {
      type: "about:blank",
      title: "Not Found",
      status: 404,
      detail: `No test route for ${request.method} ${pathname}`,
    },
    { status: 404, headers: { "Content-Type": "application/problem+json" } },
  );
}

/**
 * Answers the generated client's requests by "METHOD /path", so tests run
 * the real SDK and query code. Unlisted requests get a 404 problem, never
 * the network.
 */
export function mockApi(routes: Record<string, Route> = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const request = input as Request;
    const { pathname } = new URL(request.url);
    const route = routes[`${request.method} ${pathname}`];
    if (route === undefined) return notFound(request);
    return typeof route === "function"
      ? (route as (r: Request) => Response | Promise<Response>)(request)
      : Response.json(route);
  });
  client.setConfig({ fetch: fetchMock });
  return fetchMock;
}

/** An RFC 9457 error response, as the API sends them. */
export function problemResponse(status: number, detail?: string): Response {
  return Response.json(
    { type: "about:blank", title: "Error", status, detail },
    { status, headers: { "Content-Type": "application/problem+json" } },
  );
}
